/**
 * Módulo 1 — reparación reversible de órdenes OPEN huérfanas.
 *
 * Solo cambia status OPEN -> CANCELLED para las filas antiguas sin sesión
 * ACTIVE/CHECKOUT. Conserva órdenes y artículos, guarda hashes y permite
 * rollback fail-closed.
 *
 * Ejecutar:
 *   bun scripts/repair-module1-orphan-orders.mjs
 */
import fs from 'node:fs';

const REPAIR_SQL = 'module1_orphan_orders_repair.sql';
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
}

function assertCheck(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

assertCheck(env.SUPABASE_PROJECT_REF, 'falta SUPABASE_PROJECT_REF');
assertCheck(env.SUPABASE_ACCESS_TOKEN, 'falta SUPABASE_ACCESS_TOKEN');
assertCheck(fs.existsSync(REPAIR_SQL), `falta ${REPAIR_SQL}`);

const repairSql = fs.readFileSync(REPAIR_SQL, 'utf8');
const withoutComments = repairSql
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assertCheck(!/\b(?:DELETE|TRUNCATE|DROP)\s+(?:ONLY\s+)?public\./i.test(withoutComments), 'la reparación no puede borrar tablas públicas');
assertCheck(/UPDATE\s+public\.orders/i.test(withoutComments), 'la reparación no actualiza orders');
assertCheck(withoutComments.includes("status = 'CANCELLED'"), 'la reparación no usa CANCELLED');

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
    return JSON.parse(body);
}

const [beforeRows, snapshotRows, orderCountRows, logTableRows] = await Promise.all([
    query(`
        select count(*)::int as orphan_count
        from public.orders o
        left join public.table_sessions ts on ts.id = o.table_session_id
        where o.status = $$OPEN$$
          and (ts.id is null or ts.status not in ($$ACTIVE$$,$$CHECKOUT$$))
    `),
    query(`select count(*)::int as count from module1_internal.orphan_orders_backup`),
    query(`select count(*)::int as count from public.orders`),
    query(`
        select count(*)::int as count
        from information_schema.tables
        where table_schema = $$module1_internal$$
          and table_name = $$orphan_order_repair_log$$
    `),
]);
const orphanCount = Number(beforeRows[0]?.orphan_count);
const snapshotCount = Number(snapshotRows[0]?.count);
const logRows = Number(logTableRows[0]?.count) > 0
    ? await query(`
        select count(*)::int as count
        from module1_internal.orphan_order_repair_log
        where repaired_at is not null and rolled_back_at is null
    `)
    : [{ count: 0 }];
const activeRepairCount = Number(logRows[0]?.count);

if (orphanCount === 0 && activeRepairCount === snapshotCount) {
    console.log(JSON.stringify({
        status: 'PASS_IDEMPOTENT',
        repaired_orphans: 0,
        remaining_orphans: 0,
        historical_repair_rows: activeRepairCount,
        order_count: Number(orderCountRows[0]?.count),
        business_changes: 0,
    }, null, 2));
    process.exit(0);
}

assertCheck(orphanCount === snapshotCount, `snapshot no coincide con huérfanas (${snapshotCount} vs ${orphanCount})`);
assertCheck(activeRepairCount === 0, 'ya existe una reparación activa sin rollback');

if (orphanCount > 0) {
    await query(repairSql);
}

const [afterRows, appliedRows, afterOrderCountRows] = await Promise.all([
    query(`
        select count(*)::int as orphan_count
        from public.orders o
        left join public.table_sessions ts on ts.id = o.table_session_id
        where o.status = $$OPEN$$
          and (ts.id is null or ts.status not in ($$ACTIVE$$,$$CHECKOUT$$))
    `),
    query(`
        select count(*)::int as count
        from module1_internal.orphan_order_repair_log
        where repaired_at is not null and rolled_back_at is null
    `),
    query(`select count(*)::int as count from public.orders`),
]);

assertCheck(Number(afterRows[0]?.orphan_count) === 0, 'quedan órdenes OPEN huérfanas');
assertCheck(Number(appliedRows[0]?.count) === orphanCount, 'log de reparación incompleto');
assertCheck(Number(afterOrderCountRows[0]?.count) >= Number(orderCountRows[0]?.count), 'cloud perdió órdenes durante la reparación');

console.log(JSON.stringify({
    status: 'PASS',
    repaired_orphans: orphanCount,
    remaining_orphans: Number(afterRows[0]?.orphan_count),
    order_count_at_start: Number(orderCountRows[0]?.count),
    order_count_current: Number(afterOrderCountRows[0]?.count),
    post_snapshot_orders: Number(afterOrderCountRows[0]?.count) - Number(orderCountRows[0]?.count),
    repair_log_active: Number(appliedRows[0]?.count),
}, null, 2));
