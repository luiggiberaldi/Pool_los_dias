/**
 * Módulo 1 — prueba de integración del flujo operativo en el proyecto actual.
 *
 * Usa una cuenta, caja y mesa existentes únicamente dentro de BEGIN/ROLLBACK.
 * No crea usuarios, no deja ventas, órdenes ni sesiones persistentes.
 * Valida RLS authenticated, caja disponible, mesa, orden, artículo, pago,
 * cierre y process_checkout.
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
    return JSON.parse(body);
}

const beforeRows = await query(`
    select
        (select count(*)::int from public.orders) as orders,
        (select count(*)::int from public.order_items) as order_items,
        (select count(*)::int from public.table_sessions) as table_sessions,
        (select count(*)::int from public.payments) as payments,
        (select count(*)::int from public.sales) as sales
`);
const before = beforeRows[0];

const flowRows = await query(`
    begin;
    select set_config(
        $$request.jwt.claim.sub$$,
        (select user_id::text from public.pool_config limit 1),
        true
    );
    set local role authenticated;

    do $$
    declare
        v_uid UUID := auth.uid();
        v_table UUID;
        v_cash UUID;
        v_session UUID;
        v_order UUID;
        v_items INTEGER;
        v_payments INTEGER;
        v_checkout JSONB;
    begin
        if v_uid is null then
            raise exception 'M1_FLOW_ABORT: no auth.uid';
        end if;

        select t.id
        into v_table
        from public.tables t
        where t.user_id = v_uid
          and lower(t.status) = 'libre'
          and not exists (
              select 1 from public.table_sessions ts
              where ts.table_id = t.id and ts.status in ('ACTIVE', 'CHECKOUT')
          )
        limit 1;

        select c.id
        into v_cash
        from public.cash_sessions c
        where c.user_id = v_uid AND c.status = 'OPEN'
        limit 1;

        if v_table is null or v_cash is null then
            raise exception 'M1_FLOW_ABORT: no existe mesa libre y caja OPEN compatibles';
        end if;

        insert into public.table_sessions (
            user_id, table_id, opened_by, status, game_mode, hours_paid, total_cost_usd
        ) values (
            v_uid, v_table, 'module1-test', 'ACTIVE', 'NORMAL', 0, 0
        ) returning id into v_session;

        insert into public.orders (
            user_id, table_id, table_session_id, cash_session_id,
            created_by, status, exchange_rate_used, total_usd, total_bs
        ) values (
            v_uid, v_table, v_session, v_cash,
            'module1-test', 'OPEN', 1, 0, 0
        ) returning id into v_order;

        insert into public.order_items (
            order_id, product_id, product_name, unit_price_usd, qty, added_by
        ) values (
            v_order, 'module1-fixture', 'M1 fixture', 1, 1, 'module1-test'
        );

        update public.orders
        set total_usd = 1, total_bs = 0
        where id = v_order;

        insert into public.payments (
            order_id, cash_session_id, method, amount_usd, amount_bs, processed_by
        ) values (
            v_order, v_cash, 'CASH_USD', 1, 0, 'module1-test'
        );

        update public.orders
        set status = 'PAID', closed_at = clock_timestamp(), closed_by = 'module1-test'
        where id = v_order;

        update public.table_sessions
        set status = 'CLOSED', closed_at = clock_timestamp(), total_cost_usd = 0
        where id = v_session;

        v_checkout := public.process_checkout(jsonb_build_object(
            'idempotency_key', 'module1-operational-flow-20260825-0001',
            'total', 1,
            'cart', '[]'::jsonb,
            'payments', jsonb_build_array(jsonb_build_object(
                'amountUsd', 1,
                'methodId', 'M1_TEST',
                'methodLabel', 'M1 Test',
                'currency', 'USD'
            ))
        ));

        select count(*) into v_items from public.order_items where order_id = v_order;
        select count(*) into v_payments from public.payments where order_id = v_order;

        if v_items <> 1 or v_payments <> 1 then
            raise exception 'M1_FLOW_ABORT: artículos o pagos incompletos';
        end if;
        if coalesce(v_checkout ->> 'success', 'false') <> 'true' then
            raise exception 'M1_FLOW_ABORT: process_checkout no confirmó éxito';
        end if;

        raise notice 'M1_FLOW_PASS uid_hash=% items=% payments=%', md5(v_uid::text), v_items, v_payments;
    end
    $$;

    select jsonb_build_object(
        $$flow$$, $$PASS$$,
        $$auth_uid_hash$$, md5(auth.uid()::text)
    ) as flow_result;
    rollback;
`);

const flowResult = flowRows.find(row => row?.flow_result)?.flow_result || flowRows.at(-1)?.flow_result;
assertCheck(flowResult?.flow === 'PASS', 'flujo transaccional no confirmó PASS');

const afterRows = await query(`
    select
        (select count(*)::int from public.orders) as orders,
        (select count(*)::int from public.order_items) as order_items,
        (select count(*)::int from public.table_sessions) as table_sessions,
        (select count(*)::int from public.payments) as payments,
        (select count(*)::int from public.sales) as sales,
        (select count(*)::int from public.orders where created_by = 'module1-test') as test_orders,
        (select count(*)::int from public.sales where sync_origin = 'online' and created_at > now() - interval '2 minutes' and user_id = (select user_id from public.pool_config limit 1)) as recent_test_sales
`);
const after = afterRows[0];
for (const key of ['orders', 'order_items', 'table_sessions', 'payments', 'sales']) {
    assertCheck(Number(after[key]) === Number(before[key]), `${key} no volvió al conteo anterior tras ROLLBACK`);
}
assertCheck(Number(after.test_orders) === 0, 'quedó una orden fixture');
assertCheck(Number(after.recent_test_sales) === 0, 'quedó una venta fixture');

console.log(JSON.stringify({
    status: 'PASS',
    flow: 'cash(existing) → table → order → item → payment → checkout → rollback',
    persistent_business_changes: 0,
    counts_restored: true,
}, null, 2));
