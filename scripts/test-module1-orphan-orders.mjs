/**
 * Pruebas read-only de la reparación de órdenes huérfanas del Módulo 1.
 * Incluye una simulación BEGIN/ROLLBACK del rollback privado.
 */
import fs from 'node:fs';

const files = ['module1_orphan_orders_repair.sql', 'module1_orphan_orders_rollback.sql'];
function assertCheck(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}
for (const file of files) {
    assertCheck(fs.existsSync(file), `falta ${file}`);
    const source = fs.readFileSync(file, 'utf8')
        .replace(/--[^\r\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assertCheck(!/\b(?:DELETE|TRUNCATE|DROP)\s+(?:ONLY\s+)?public\./i.test(source), `${file} no borra datos públicos`);
}

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
}
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) assertCheck(env[key], `falta ${key}`);

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
    if (!response.ok) throw new Error(`Management API ${response.status}: ${body.slice(0, 600)}`);
    return JSON.parse(body);
}

const [invariants, logs, counts, snapshotIntegrity] = await Promise.all([
    query(`
        select count(*)::int as orphan_count
        from public.orders o
        left join public.table_sessions ts on ts.id = o.table_session_id
        where o.status = $$OPEN$$
          and (ts.id is null or ts.status not in ($$ACTIVE$$,$$CHECKOUT$$))
    `),
    query(`
        select count(*)::int as repaired,
               count(*) filter(where rolled_back_at is null)::int as active,
               count(*) filter(where post_row_hash is null)::int as incomplete
        from module1_internal.orphan_order_repair_log
    `),
    query(`
        select
            (select count(*)::int from public.orders) as orders,
            (select count(*)::int from module1_internal.pre_module1_orders) as snapshot_orders,
            (select count(*)::int from public.orders where status = $$CANCELLED$$ and closed_by = $$module1-orphan-repair$$) as marked_cancelled
    `),
    query(`
        select
            count(*)::int as snapshot_orders,
            count(o.id)::int as present_snapshot_orders,
            count(*) filter (where l.repaired_at is not null and l.rolled_back_at is null
                and md5(to_jsonb(o)::text) = l.post_row_hash)::int as intact_repairs
        from module1_internal.pre_module1_orders p
        left join public.orders o on o.id = p.id
        left join module1_internal.orphan_order_repair_log l on l.order_id = p.id
    `),
]);

assertCheck(Number(invariants[0]?.orphan_count) === 0, 'quedan órdenes OPEN huérfanas');
assertCheck(Number(logs[0]?.repaired) === Number(logs[0]?.active), 'hay reparaciones con rollback parcial');
assertCheck(Number(logs[0]?.incomplete) === 0, 'hay logs sin post_row_hash');
assertCheck(Number(snapshotIntegrity[0]?.snapshot_orders) === Number(counts[0]?.snapshot_orders), 'snapshot de órdenes inconsistente');
assertCheck(Number(snapshotIntegrity[0]?.present_snapshot_orders) === Number(counts[0]?.snapshot_orders), 'falta una orden del snapshot');
assertCheck(Number(counts[0]?.orders) >= Number(counts[0]?.snapshot_orders), 'cloud perdió órdenes del snapshot');
assertCheck(Number(counts[0]?.marked_cancelled) === Number(logs[0]?.active), 'órdenes canceladas no coinciden con el log');
assertCheck(Number(snapshotIntegrity[0]?.intact_repairs) === Number(logs[0]?.active), 'una orden reparada cambió después de la reparación');

const rollback = fs.readFileSync('module1_orphan_orders_rollback.sql', 'utf8')
    .replace(/^\s*BEGIN;\s*/i, '')
    .replace(/\s*COMMIT;\s*$/i, '');
const beforeActive = Number(logs[0]?.active);
await query(`BEGIN; ${rollback} ROLLBACK;`);
const afterRollbackCheck = await query(`
    select count(*)::int as active
    from module1_internal.orphan_order_repair_log
    where repaired_at is not null and rolled_back_at is null
`);
assertCheck(Number(afterRollbackCheck[0]?.active) === beforeActive, 'rollback check transaccional alteró el log');

console.log(JSON.stringify({
    status: 'PASS',
    remaining_orphans: Number(invariants[0]?.orphan_count),
    repaired_orders: Number(logs[0]?.active),
    orders_preserved_at_snapshot: Number(counts[0]?.snapshot_orders),
    current_orders: Number(counts[0]?.orders),
    post_snapshot_orders: Number(counts[0]?.orders) - Number(counts[0]?.snapshot_orders),
    rollback_check: 'PASS_TRANSACTIONAL',
}, null, 2));
