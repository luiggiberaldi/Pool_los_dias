/**
 * Módulo 2 — prepara la cola privada de aprobación de ventas legacy.
 *
 * Ejecuta únicamente DDL/INSERT sobre module2_internal. Nunca asigna user_id
 * ni modifica public.sales. La aprobación y aplicación se mantienen separadas.
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

const env = loadEnv();
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
    assertCheck(env[key], `falta ${key}`);
}

const migration = fs.readFileSync('legacy_sales_approval_queue.sql', 'utf8');
const executableSql = stripComments(migration);
assertCheck(!/\b(?:UPDATE|DELETE|TRUNCATE)\s+public\.sales\b/i.test(executableSql), 'la cola no puede mutar public.sales');
assertCheck(!/\bINSERT\s+INTO\s+public\.sales\b/i.test(executableSql), 'la cola no puede insertar en public.sales');
assertCheck(migration.includes('legacy_sales_approval_queue'), 'falta la tabla de cola');
assertCheck(migration.includes('review_status') && migration.includes('reviewer'), 'falta trazabilidad del revisor');

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
    const text = await response.text();
    if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 700)}`);
    return text ? JSON.parse(text) : [];
}

await query(migration);

const [summaryRows, salesRows, decisionRows] = await Promise.all([
    query(`select * from module2_internal.legacy_sales_approval_summary`),
    query(`
        select count(*)::int as total,
               count(*) filter (where user_id is null)::int as unassigned
        from public.sales
    `),
    query(`
        select count(*)::int as approved_decisions
        from module2_internal.legacy_sales_assignment_decisions d
        where d.run_id = (select run_id from module2_internal.legacy_sales_assignment_runs order by started_at desc limit 1)
          and d.decision = $$APPROVE$$
    `),
]);

const summary = summaryRows[0];
assertCheck(summary, 'no existe resumen de aprobación');
assertCheck(Number(summary.unique_proposals) === 1134, 'la cola no contiene las 1.134 propuestas únicas');
assertCheck(Number(summary.pending_reviews) === 1134, 'la cola no quedó completamente pendiente');
assertCheck(Number(summary.approved_reviews) === 0, 'se aprobaron filas automáticamente');
assertCheck(Number(summary.rejected_reviews) === 0 && Number(summary.hold_reviews) === 0, 'la cola fue alterada durante la preparación');
assertCheck(Number(summary.conflict_sales) === 86, 'los conflictos dejaron de estar bloqueados');
assertCheck(Number(summary.unresolved_sales) === 462, 'los unresolved dejaron de estar bloqueados');
assertCheck(Number(salesRows[0]?.total) === 1682 && Number(salesRows[0]?.unassigned) === 1682, 'la cola modificó public.sales');
assertCheck(Number(decisionRows[0]?.approved_decisions) === 0, 'hay decisiones APPROVE sin revisión explícita');

console.log(JSON.stringify({
    status: 'PASS',
    run_id: `${String(summary.run_id).slice(0, 8)}…`,
    unique_proposals: Number(summary.unique_proposals),
    pending_reviews: Number(summary.pending_reviews),
    conflict_sales: Number(summary.conflict_sales),
    unresolved_sales: Number(summary.unresolved_sales),
    applied_business_changes: 0,
}, null, 2));
