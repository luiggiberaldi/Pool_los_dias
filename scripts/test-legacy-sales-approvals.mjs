/**
 * Módulo 2 — invariantes de la cola y ledger de aprobación.
 *
 * Es read-only: no inserta decisiones ni modifica public.sales. Comprueba que
 * las 1.134 propuestas únicas fueron aplicadas con trazabilidad y que
 * conflictos/unresolved continúan bloqueados.
 */
import fs from 'node:fs';

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

function assertCheck(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

function stripComments(sql) {
    return sql.replace(/--[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const queueSql = fs.readFileSync('legacy_sales_approval_queue.sql', 'utf8');
const queueExecutableSql = stripComments(queueSql);
assertCheck(!/\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:ONLY\s+)?public\.sales\b/i.test(queueExecutableSql), 'la cola no muta public.sales');
assertCheck(!/\bINSERT\s+INTO\s+public\.sales\b/i.test(queueExecutableSql), 'la cola no inserta en public.sales');
assertCheck(queueSql.includes('legacy_sales_approval_ledger'), 'falta el ledger append-only');
assertCheck(queueSql.includes("'PROPOSED'"), 'falta el evento de propuesta');
assertCheck(queueSql.includes('append_only'), 'el ledger no tiene guardrail append-only');
assertCheck(/BEFORE UPDATE OR DELETE ON module2_internal\.legacy_sales_approval_ledger/i.test(queueSql), 'el ledger permite mutaciones');

const runnerSql = fs.readFileSync('scripts/manage-legacy-sales-approvals.mjs', 'utf8');
assertCheck(runnerSql.includes('APPROVE_ONE'), 'la revisión no exige confirmación por fila');
assertCheck(runnerSql.includes('APPLY_EXPLICIT_APPROVED_MAPPINGS'), 'la aplicación no exige confirmación exacta');
assertCheck(runnerSql.includes('ROLLBACK_EXPLICIT_LEGACY_ASSIGNMENTS'), 'el rollback no exige confirmación exacta');
assertCheck(runnerSql.includes('candidate-user-id'), 'la revisión no exige candidato explícito');
assertCheck(!/approve\s+all|approveAll|approve-all/i.test(runnerSql), 'existe una ruta de aprobación masiva');

const env = loadEnv();
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
    assertCheck(env[key], `falta ${key}`);
}

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
    if (!response.ok) throw new Error(`Management API ${response.status}: ${body.slice(0, 700)}`);
    return body ? JSON.parse(body) : [];
}

const [runRows, queueRows, ledgerRows, invalidLedgerRows, decisionRows, salesRows, applyRows] = await Promise.all([
    query(`
        select run_id, status, source_sales_count, source_unassigned_count,
               proposed_unique_count, conflict_count, unresolved_count,
               invalid_owner_count, assigned_count, rolled_back_count
        from module2_internal.legacy_sales_assignment_runs
        order by started_at desc
        limit 1
    `),
    query(`
        select review_status, count(*)::int as count
        from module2_internal.legacy_sales_approval_queue
        where run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
        group by review_status
    `),
    query(`
        select event_type, count(*)::int as count
        from module2_internal.legacy_sales_approval_ledger
        where run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
        group by event_type
    `),
    query(`
        select count(*)::int as invalid_ledger_events
        from module2_internal.legacy_sales_approval_ledger
        where reviewer is null or btrim(reviewer) = ''
           or rationale is null or btrim(rationale) = ''
           or snapshot_row_hash is null or snapshot_row_hash = ''
    `),
    query(`
        select d.decision, count(*)::int as count
        from module2_internal.legacy_sales_assignment_decisions d
        where d.run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
        group by d.decision
    `),
    query(`
        select count(*)::int as total,
               count(*) filter (where user_id is null)::int as unassigned
        from public.sales
    `),
    query(`
        select count(*)::int as count
        from module2_internal.legacy_sales_assignment_apply_log
        where run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
    `),
]);

const run = runRows[0];
assertCheck(run, 'no existe run legacy');
assertCheck(run.status === 'PARTIALLY_APPLIED', 'el run no está en aplicación parcial esperada');
assertCheck(Number(run.source_sales_count) === 1682, 'cambió el total legacy auditado');
assertCheck(Number(run.source_unassigned_count) === 1682, 'cambió el total sin propietario');
assertCheck(Number(run.proposed_unique_count) === 1134, 'propuestas únicas inesperadas');
assertCheck(Number(run.conflict_count) === 86, 'conflictos inesperados');
assertCheck(Number(run.unresolved_count) === 462, 'unresolved inesperados');
assertCheck(Number(run.invalid_owner_count) === 0, 'propietarios inválidos presentes');
assertCheck(Number(run.assigned_count) === 1134, 'el run no declara las 1.134 asignaciones');
assertCheck(Number(run.rolled_back_count) === 0, 'el run declara rollback');

const queue = Object.fromEntries(queueRows.map(row => [row.review_status, Number(row.count)]));
assertCheck(queue.APPROVED === 1134, 'la cola no conserva las 1.134 aprobaciones');
assertCheck(!queue.PENDING && !queue.REJECTED && !queue.HOLD, 'la cola contiene estados inesperados');

const ledger = Object.fromEntries(ledgerRows.map(row => [row.event_type, Number(row.count)]));
assertCheck(ledger.PROPOSED === 1134 && ledger.APPROVED === 1134, 'el ledger no conserva propuesta y aprobación completas');
assertCheck(Number(invalidLedgerRows[0]?.invalid_ledger_events) === 0, 'el ledger contiene eventos sin trazabilidad completa');

const decisions = Object.fromEntries(decisionRows.map(row => [row.decision, Number(row.count)]));
assertCheck(decisions.APPROVE === 1134 && !decisions.REJECT && !decisions.HOLD, 'decisiones del run incompletas');
assertCheck(Number(salesRows[0]?.total) === 1682, 'cambió el total de public.sales');
assertCheck(Number(salesRows[0]?.unassigned) === 548, 'public.sales no conserva los 548 bloqueos');
assertCheck(Number(applyRows[0]?.count) === 1134, 'apply_log no conserva las asignaciones');

console.log(JSON.stringify({
    status: 'PASS',
    run_id: `${String(run.run_id).slice(0, 8)}…`,
    unique_proposals_approved: queue.APPROVED,
    ledger_proposals: ledger.PROPOSED,
    ledger_approvals: ledger.APPROVED,
    remaining_unassigned: Number(salesRows[0]?.unassigned),
    conflicts_blocked: Number(run.conflict_count),
    unresolved_blocked: Number(run.unresolved_count),
    public_sales_updates: 0,
}, null, 2));
