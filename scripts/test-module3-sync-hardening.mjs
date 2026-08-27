/**
 * Módulo 3 — hardening offline/Realtime y aislamiento por cuenta.
 *
 * Este runner no inserta, actualiza ni elimina datos. Valida contratos locales
 * de scope/cleanup y comprueba en cloud que las tablas de sincronización tengan
 * propietario y que ninguna fila quede sin cuenta.
 */
import fs from 'node:fs';

function assertCheck(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

function read(path) {
    assertCheck(fs.existsSync(path), `falta ${path}`);
    return fs.readFileSync(path, 'utf8');
}

const cloudSync = read('src/hooks/useCloudSync.js');
const salesSync = read('src/utils/salesSyncService.js');
const checkout = read('src/utils/checkoutProcessor.js');
const offlineQueue = read('src/services/offlineQueueService.js');
const accountScope = read('src/hooks/store/accountScope.js');
const tablesRealtime = read('src/hooks/store/tableRealtimeActions.js');
const ordersStore = read('src/hooks/store/useOrdersStore.js');

assertCheck(cloudSync.includes('cleanupCloudSyncResources'), 'useCloudSync no tiene cleanup centralizado');
assertCheck(cloudSync.includes('supabaseCloud.removeChannel(globalSubscription)'), 'sync_documents no libera el canal global');
assertCheck(cloudSync.includes('salesRealtimeCleanup = subscribeSalesRealtime'), 'ventas no guardan cleanup');
assertCheck(cloudSync.includes('clearInterval(heartbeatInterval)'), 'heartbeat no tiene cleanup');
assertCheck(cloudSync.includes('[isCloudConfigured, cloudUserId]'), 'cambio de cuenta no reinicializa el motor');
assertCheck(salesSync.includes('getPendingSalesQueueKey'), 'cola de ventas no está scoped');
assertCheck(!/localStorage\.(?:getItem|setItem|removeItem)\(['"]_pending_sale_uploads['"]/.test(salesSync), 'salesSync conserva una clave global');
assertCheck(checkout.includes('scopedKey(PENDING_SALES_QUEUE_KEY)'), 'checkout no encola por cuenta');
assertCheck(offlineQueue.includes('scopedKey(QUEUE_KEY_BASE)'), 'offlineQueue no está scoped');
assertCheck(offlineQueue.includes('scopedKey(SYNC_LOCK_KEY_BASE)'), 'lock offline no está scoped');
assertCheck(accountScope.includes('getAccountId'), 'accountScope no expone user id');
assertCheck(tablesRealtime.includes('supabaseCloud.removeChannel(get().realtimeChannel)'), 'mesas no liberan canal');
assertCheck(ordersStore.includes('supabaseCloud.removeChannel(get().realtimeChannel)'), 'órdenes no liberan canal');
assertCheck(ordersStore.includes('orders_live:${userId}'), 'canal de órdenes no está por usuario');

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

const [syncRows, orderRows, itemRows, tableRows, sessionRows, unownedRows] = await Promise.all([
    query(`
        select count(*)::int as total,
               count(*) filter(where user_id is null)::int as unowned,
               count(distinct user_id)::int as owners
        from public.sync_documents
    `),
    query(`
        select count(*)::int as total,
               count(*) filter(where user_id is null)::int as unowned,
               count(distinct user_id)::int as owners
        from public.orders
    `),
    query(`
        select count(*)::int as total,
               count(*) filter(where o.user_id is null)::int as unowned
        from public.order_items i
        left join public.orders o on o.id = i.order_id
    `),
    query(`
        select count(*)::int as total,
               count(*) filter(where user_id is null)::int as unowned,
               count(distinct user_id)::int as owners
        from public.tables
    `),
    query(`
        select count(*)::int as total,
               count(*) filter(where user_id is null)::int as unowned,
               count(distinct user_id)::int as owners
        from public.table_sessions
    `),
    query(`
        select count(*)::int as count
        from public.sync_documents d
        where not exists(select 1 from auth.users u where u.id = d.user_id)
    `),
]);

for (const [name, rows] of Object.entries({ sync_documents: syncRows, orders: orderRows, tables: tableRows, table_sessions: sessionRows })) {
    assertCheck(Number(rows[0]?.unowned) === 0, `${name} tiene filas sin propietario`);
    assertCheck(Number(rows[0]?.owners) > 0, `${name} no tiene propietarios válidos`);
}
assertCheck(Number(itemRows[0]?.unowned) === 0, 'order_items tiene órdenes sin propietario');
assertCheck(Number(itemRows[0]?.total) >= 0, 'conteo de order_items inválido');
assertCheck(Number(unownedRows[0]?.count) === 0, 'sync_documents tiene propietarios inexistentes');

console.log(JSON.stringify({
    status: 'PASS',
    local_contracts: 'SCOPED_QUEUE_AND_CLEANUP',
    cloud_invariants: 'OWNED_ROWS_ONLY',
    sync_documents: syncRows[0],
    orders: orderRows[0],
    order_items: itemRows[0],
    tables: tableRows[0],
    table_sessions: sessionRows[0],
    invalid_sync_owners: Number(unownedRows[0]?.count),
}, null, 2));
