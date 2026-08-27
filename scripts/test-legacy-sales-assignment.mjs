/**
 * Legacy sales assignment — pruebas read-only.
 *
 * Ejecutar:
 *   bun scripts/test-legacy-sales-assignment.mjs
 *
 * No inserta decisiones, no actualiza public.sales y no imprime emails, tokens
 * ni filas de negocio.
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

const migration = fs.readFileSync('legacy_sales_assignment_migration.sql', 'utf8');
const sqlWithoutComments = migration
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assertCheck(!/\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:ONLY\s+)?public\.sales\b/i.test(sqlWithoutComments), 'la fase de preparación no muta public.sales');
assertCheck(migration.includes('legacy_sales_snapshot'), 'existe snapshot privado');
assertCheck(migration.includes('PROPOSED_UNIQUE_EXACT'), 'existe clasificación de coincidencia única');
assertCheck(migration.includes('CONFLICT') && migration.includes('UNRESOLVED'), 'existen estados fail-closed');

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
    if (!response.ok) throw new Error(`Management API ${response.status}: ${body.slice(0, 500)}`);
    return JSON.parse(body);
}

const [runRows, statusRows, snapshotRows, salesRows, applyRows] = await Promise.all([
    query(`
        select run_id, status, source_sales_count, source_unassigned_count,
               proposed_unique_count, conflict_count, unresolved_count,
               invalid_owner_count, assigned_count, rolled_back_count
        from module2_internal.legacy_sales_assignment_runs
        order by started_at desc
        limit 1
    `),
    query(`
        select candidate_status, count(*)::int as count
        from module2_internal.legacy_sales_assignment_candidates
        where run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
        group by candidate_status
    `),
    query(`
        select count(*)::int as count
        from module2_internal.legacy_sales_snapshot
        where run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
    `),
    query(`
        select count(*)::int as total,
               count(*) filter (where user_id is null)::int as unassigned
        from public.sales
    `),
    query(`
        select count(*)::int as count
        from module2_internal.legacy_sales_assignment_apply_log
    `),
]);

const run = runRows[0];
assertCheck(run, 'existe un run de preparación');
assertCheck(['PREPARED', 'PARTIALLY_APPLIED'].includes(run.status), 'el run tiene un estado inesperado');
assertCheck(Number(run.source_sales_count) === 1682, 'el total auditado de ventas cambió inesperadamente');
assertCheck(Number(run.source_unassigned_count) === 1682, 'el total legacy auditado cambió inesperadamente');
assertCheck(Number(run.proposed_unique_count) === 1134, 'la cantidad de propuestas únicas no coincide');
assertCheck(Number(run.conflict_count) === 86, 'la cantidad de conflictos no coincide');
assertCheck(Number(run.unresolved_count) === 462, 'la cantidad sin evidencia no coincide');
assertCheck(Number(run.invalid_owner_count) === 0, 'hay candidatos con auth.users inexistente');
assertCheck(Number(snapshotRows[0]?.count) === 1682, 'el snapshot no cubre todas las ventas legacy');
assertCheck(Number(salesRows[0]?.total) === 1682 && Number(salesRows[0]?.unassigned) === 548, 'public.sales no refleja las 1.134 asignaciones únicas');
assertCheck(Number(applyRows[0]?.count) === 1134, 'apply_log no conserva las 1.134 asignaciones');

const counts = Object.fromEntries(statusRows.map(row => [row.candidate_status, Number(row.count)]));
assertCheck(counts.PROPOSED_UNIQUE_EXACT === 1134, 'candidatos únicos incompletos');
assertCheck(counts.CONFLICT === 172, 'candidatos de conflictos incompletos');
assertCheck(counts.UNRESOLVED === 462, 'candidatos unresolved incompletos');

console.log(`PASS: legacy verificado read-only (run ${run.run_id.slice(0, 8)}…, 1.134 asignadas, 548 bloqueadas, rollback disponible).`);
