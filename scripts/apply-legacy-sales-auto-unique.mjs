/**
 * Módulo 2 — aplicación controlada de ventas legacy únicas exactas.
 *
 * Por defecto ejecuta la migración dentro de BEGIN/ROLLBACK. Solo --commit
 * permite persistir las 1.134 asignaciones PROPOSED_UNIQUE_EXACT.
 * Conflictos y unresolved nunca entran en esta operación.
 */
import fs from 'node:fs';

const RUN_ID = '61e0ba0f-a76e-4cce-bd78-673e699f2b60';
const SQL_PATH = 'legacy_sales_assignment_auto_unique_apply.sql';

function loadEnv() {
    const values = {};
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        values[match[1]] = value;
    }
    return values;
}

function fail(message) {
    throw new Error(`LEGACY_AUTO_ASSIGN_ABORT: ${message}`);
}

function assertCheck(condition, message) {
    if (!condition) fail(message);
}

function sqlLiteral(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

const env = loadEnv();
assertCheck(env.SUPABASE_PROJECT_REF, 'falta SUPABASE_PROJECT_REF en .env');
assertCheck(env.SUPABASE_ACCESS_TOKEN, 'falta SUPABASE_ACCESS_TOKEN en .env');
assertCheck(fs.existsSync(SQL_PATH), `falta ${SQL_PATH}`);

const endpoint = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
async function query(sql) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });
    const body = await response.text();
    if (!response.ok) fail(`Management API ${response.status}: ${body.slice(0, 700)}`);
    try {
        return body ? JSON.parse(body) : [];
    } catch {
        fail('respuesta no JSON de Management API');
    }
}

const staticSql = fs.readFileSync(SQL_PATH, 'utf8')
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assertCheck(!/\b(?:DELETE|TRUNCATE|DROP)\s+public\./i.test(staticSql), 'la migración contiene borrado público');
assertCheck(/UPDATE\s+public\.sales/i.test(staticSql), 'la migración no actualiza sales');
assertCheck(staticSql.includes('SYSTEM_AUTOMATED_UNIQUE_EXACT_USER_AUTHORIZED'), 'falta identidad de política');

const runLiteral = sqlLiteral(RUN_ID);
const [runRows, queueRows, candidateRows, conflictRows, unresolvedRows, invalidRows, stateBefore] = await Promise.all([
    query(`select run_id,status,source_sales_count,source_unassigned_count,assigned_count,rolled_back_count from module2_internal.legacy_sales_assignment_runs where run_id=${runLiteral}::uuid`),
    query(`select count(*)::int as count from module2_internal.legacy_sales_approval_queue where run_id=${runLiteral}::uuid and review_status=$$PENDING$$`),
    query(`select count(*)::int as count from module2_internal.legacy_sales_assignment_candidates where run_id=${runLiteral}::uuid and candidate_status=$$PROPOSED_UNIQUE_EXACT$$`),
    query(`select count(distinct sale_id)::int as count from module2_internal.legacy_sales_assignment_candidates where run_id=${runLiteral}::uuid and candidate_status=$$CONFLICT$$`),
    query(`select count(*)::int as count from module2_internal.legacy_sales_assignment_candidates where run_id=${runLiteral}::uuid and candidate_status=$$UNRESOLVED$$`),
    query(`
        select count(*)::int as count
        from module2_internal.legacy_sales_approval_queue q
        join module2_internal.legacy_sales_snapshot snap on snap.run_id=q.run_id and snap.sale_id=q.sale_id
        join public.sales s on s.id=q.sale_id
        where q.run_id=${runLiteral}::uuid and q.review_status=$$PENDING$$
          and (q.row_hash is distinct from snap.row_hash
            or s.user_id is not null
            or md5(to_jsonb(s)::text) is distinct from snap.row_hash
            or not exists(select 1 from auth.users u where u.id=q.candidate_user_id))
    `),
    query(`
        select count(*) filter(where user_id is null)::int as unassigned,
               count(*) filter(where user_id is not null)::int as assigned
        from public.sales
    `),
]);

const run = runRows[0];
assertCheck(run?.status === 'PREPARED', `run no aplicable: ${run?.status ?? 'ausente'}`);
assertCheck(Number(run.source_sales_count) === 1682, 'source_sales_count inesperado');
assertCheck(Number(run.source_unassigned_count) === 1682, 'source_unassigned_count inesperado');
assertCheck(Number(run.assigned_count) === 0 && Number(run.rolled_back_count) === 0, 'el run ya tiene aplicación o rollback');
assertCheck(Number(queueRows[0]?.count) === 1134, 'la cola no tiene 1.134 PENDING');
assertCheck(Number(candidateRows[0]?.count) === 1134, 'los candidatos únicos no son 1.134');
assertCheck(Number(conflictRows[0]?.count) === 86, 'los conflictos no son 86');
assertCheck(Number(unresolvedRows[0]?.count) === 462, 'los unresolved no son 462');
assertCheck(Number(invalidRows[0]?.count) === 0, 'hay candidatos únicos con evidencia alterada');
assertCheck(Number(stateBefore[0]?.unassigned) === 1682, 'public.sales ya fue modificada');

const commit = process.argv.includes('--commit');
let migration = fs.readFileSync(SQL_PATH, 'utf8');
if (!commit) migration = migration.replace(/\bCOMMIT;\s*$/i, 'ROLLBACK;');
const result = await query(`select set_config('app.legacy_sales_run_id',${runLiteral},false);\n${migration}`);

const [stateAfter, decisionRows, applyRows, queueAfter] = await Promise.all([
    query(`select count(*) filter(where user_id is null)::int as unassigned,count(*) filter(where user_id is not null)::int as assigned from public.sales`),
    query(`select count(*)::int as approved from module2_internal.legacy_sales_assignment_decisions where run_id=${runLiteral}::uuid and decision=$$APPROVE$$`),
    query(`select count(*)::int as applied from module2_internal.legacy_sales_assignment_apply_log where run_id=${runLiteral}::uuid and applied_at is not null and rolled_back_at is null`),
    query(`select review_status,count(*)::int as count from module2_internal.legacy_sales_approval_queue where run_id=${runLiteral}::uuid group by review_status order by review_status`),
]);

if (!commit) {
    assertCheck(Number(stateAfter[0]?.unassigned) === 1682, 'dry-run modificó public.sales');
    assertCheck(Number(decisionRows[0]?.approved) === 0, 'dry-run dejó decisiones');
    assertCheck(Number(applyRows[0]?.applied) === 0, 'dry-run dejó apply_log');
    console.log(JSON.stringify({
        status: 'DRY_RUN_PASS',
        run_id: RUN_ID,
        would_assign: 1134,
        would_remain_blocked: 548,
        public_sales_updates: 0,
        transaction_rolled_back: true,
        api_result_tail: result.at(-1) ?? null,
    }, null, 2));
} else {
    assertCheck(Number(stateAfter[0]?.unassigned) === 548, `se esperaban 548 ventas bloqueadas, quedan ${stateAfter[0]?.unassigned}`);
    assertCheck(Number(stateAfter[0]?.assigned) === 1134, `se esperaban 1.134 ventas asignadas, hay ${stateAfter[0]?.assigned}`);
    assertCheck(Number(decisionRows[0]?.approved) === 1134, 'ledger de decisiones incompleto');
    assertCheck(Number(applyRows[0]?.applied) === 1134, 'apply_log incompleto');
    console.log(JSON.stringify({
        status: 'COMMITTED_PARTIAL_ASSIGNMENT',
        run_id: RUN_ID,
        assigned_unique_exact: Number(stateAfter[0]?.assigned),
        remaining_unassigned: Number(stateAfter[0]?.unassigned),
        conflicts_still_blocked: 86,
        unresolved_still_blocked: 462,
        rollback_available_rows: Number(applyRows[0]?.applied),
        queue: queueAfter,
    }, null, 2));
}
