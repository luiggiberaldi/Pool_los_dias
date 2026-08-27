/**
 * Módulo 4: migración controlada de idempotencia del checkout.
 * Por defecto solo ejecuta preflight y una prueba transaccional con ROLLBACK.
 * --commit aplica la migración después de que el preflight pase.
 */
import fs from 'node:fs';

const SQL_PATH = 'module4_checkout_idempotency_migration.sql';

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
    if (!condition) throw new Error(`MODULE4_ABORT: ${message}`);
}

const env = loadEnv();
assertCheck(env.SUPABASE_PROJECT_REF, 'falta SUPABASE_PROJECT_REF');
assertCheck(env.SUPABASE_ACCESS_TOKEN, 'falta SUPABASE_ACCESS_TOKEN');
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
    if (!response.ok) throw new Error(`Management API ${response.status}: ${body.slice(0, 1000)}`);
    try { return body ? JSON.parse(body) : []; }
    catch { throw new Error(`respuesta no JSON: ${body.slice(0, 1000)}`); }
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');
const sqlWithoutLeadingComments = sql.replace(/^\s*(?:--[^\r\n]*\r?\n|\/\*[\s\S]*?\*\/\s*)*/g, '').trim();
assertCheck(/^BEGIN;/.test(sqlWithoutLeadingComments), 'la migración debe iniciar con BEGIN');
assertCheck(/CREATE TABLE IF NOT EXISTS module4_internal\.checkout_idempotency/i.test(sql), 'falta ledger privado');
assertCheck(/pg_advisory_xact_lock/i.test(sql), 'falta serialización por clave');
assertCheck(/idempotency_key/i.test(sql), 'falta clave de idempotencia');
assertCheck(/REVOKE EXECUTE ON FUNCTION public\.process_checkout/i.test(sql), 'falta revocación del RPC');
assertCheck(!/\b(?:DROP|TRUNCATE|DELETE)\s+public\./i.test(sql), 'la migración contiene borrado público');

const auditRows = await query(`
    select
        (select coalesce(jsonb_agg(jsonb_build_object('schema', n.nspname, 'identity', p.oid::regprocedure::text)), '[]'::jsonb)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname = 'digest') as digest_functions,
        (select count(*)::int from pg_extension where extname = 'pgcrypto') as pgcrypto,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='sales' and column_name='user_id') as sales_user_id,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='sales' and column_name='total') as sales_total,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='sale_items' and column_name in ('sale_id','product_id','quantity','unit_price','subtotal')) as sale_item_columns,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='journal_entries' and column_name in ('transaction_id','account_code','debit','credit','description')) as journal_columns,
        (select count(*)::int from public.sales) as sales_before,
        (select count(*)::int from public.journal_entries) as journal_before,
        (select count(*)::int from information_schema.tables where table_schema='module4_internal' and table_name='checkout_idempotency') as ledger_exists
`);
const audit = auditRows[0] || {};
assertCheck(Number(audit.pgcrypto) === 1, 'pgcrypto no está disponible para hash SHA-256');
console.log(JSON.stringify({ module4_capabilities: { pgcrypto: Number(audit.pgcrypto), digest_functions: audit.digest_functions } }));
assertCheck(Number(audit.sales_user_id) === 1 && Number(audit.sales_total) === 1, 'sales no coincide con el contrato auditado');
assertCheck(Number(audit.sale_item_columns) === 5, 'sale_items no coincide con el contrato auditado');
assertCheck(Number(audit.journal_columns) === 5, 'journal_entries no coincide con el contrato auditado');

const testSql = sql.replace(/\bCOMMIT;\s*$/i, '');
const result = await query(`
    ${testSql}
    select set_config('request.jwt.claim.sub', (select user_id::text from public.sales where user_id is not null limit 1), true);
    set local role authenticated;
    do $$
    declare
        first_result jsonb;
        replay_result jsonb;
        first_id uuid;
        replay_id uuid;
        key text := 'module4-preflight-20260825-0001';
    begin
        first_result := public.process_checkout(jsonb_build_object(
            'idempotency_key', key,
            'total', 1,
            'cart', '[]'::jsonb,
            'payments', jsonb_build_array(jsonb_build_object(
                'amountUsd', 1, 'methodId', 'M4_TEST', 'methodLabel', 'M4 Test', 'currency', 'USD'
            ))
        ));
        replay_result := public.process_checkout(jsonb_build_object(
            'idempotency_key', key,
            'total', 1,
            'cart', '[]'::jsonb,
            'payments', jsonb_build_array(jsonb_build_object(
                'amountUsd', 1, 'methodId', 'M4_TEST', 'methodLabel', 'M4 Test', 'currency', 'USD'
            ))
        ));
        first_id := (first_result ->> 'sale_id')::uuid;
        replay_id := (replay_result ->> 'sale_id')::uuid;
        if first_id is null or first_id <> replay_id then
            raise exception 'MODULE4_ABORT: replay devolvió sale_id diferente';
        end if;
        if coalesce((replay_result ->> 'idempotent_replay')::boolean, false) <> true then
            raise exception 'MODULE4_ABORT: replay no fue marcado como idempotente';
        end if;
        begin
            perform public.process_checkout(jsonb_build_object(
                'idempotency_key', key,
                'total', 2,
                'cart', '[]'::jsonb,
                'payments', jsonb_build_array(jsonb_build_object(
                    'amountUsd', 2, 'methodId', 'M4_TEST', 'methodLabel', 'M4 Test', 'currency', 'USD'
                ))
            ));
            raise exception 'MODULE4_ABORT: se aceptó payload distinto con la misma clave';
        exception when unique_violation then
            null;
        end;
    end
    $$;
    rollback;
`);

const postRows = await query(`
    select
        (select count(*)::int from public.sales) as sales_after,
        (select count(*)::int from public.journal_entries) as journal_after,
        (select count(*)::int from information_schema.tables where table_schema='module4_internal' and table_name='checkout_idempotency') as ledger_exists
`);
const post = postRows[0] || {};
assertCheck(Number(post.sales_after) === Number(audit.sales_before), 'el preflight dejó ventas persistentes');
assertCheck(Number(post.journal_after) === Number(audit.journal_before), 'el preflight dejó asientos persistentes');

const commit = process.argv.includes('--commit');
if (commit) {
    await query(sql);
    const committedRows = await query(`
        select
            (select count(*)::int from information_schema.tables where table_schema='module4_internal' and table_name='checkout_idempotency') as ledger_exists,
            (select has_function_privilege('anon', 'public.process_checkout(jsonb)', 'EXECUTE')::int) as anon_execute,
            (select has_function_privilege('authenticated', 'public.process_checkout(jsonb)', 'EXECUTE')::int) as auth_execute,
            (select has_function_privilege('anon', 'module4_internal.record_checkout_idempotency(uuid,text,uuid,text,numeric)', 'EXECUTE')::int) as anon_helper_execute,
            (select has_function_privilege('authenticated', 'module4_internal.record_checkout_idempotency(uuid,text,uuid,text,numeric)', 'EXECUTE')::int) as auth_helper_execute,
            (select p.prosecdef::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='process_checkout' and pg_get_function_identity_arguments(p.oid)='payload jsonb') as process_security_definer,
            (select p.proconfig::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='process_checkout' and pg_get_function_identity_arguments(p.oid)='payload jsonb') as process_config
    `);
    const committed = committedRows[0] || {};
    assertCheck(Number(committed.ledger_exists) === 1, 'ledger no quedó creado');
    assertCheck(Number(committed.anon_execute) === 0, 'anon conserva EXECUTE sobre process_checkout');
    assertCheck(Number(committed.auth_execute) === 1, 'authenticated perdió EXECUTE sobre process_checkout');
    assertCheck(Number(committed.anon_helper_execute) === 0 && Number(committed.auth_helper_execute) === 0, 'el helper privado es ejecutable por un rol externo');
    assertCheck(Number(committed.process_security_definer) === 1, 'process_checkout no quedó SECURITY DEFINER');
    assertCheck(String(committed.process_config || '').includes('search_path='), 'process_checkout no tiene search_path fijo');
    console.log(JSON.stringify({
        status: 'MODULE4_COMMITTED',
        preflight: 'PASS_TRANSACTIONAL',
        persistent_sales_change: 0,
        persistent_journal_change: 0,
        idempotency_ledger: 'created',
        anon_process_checkout_execute: false,
        authenticated_process_checkout_execute: true,
    }, null, 2));
} else {
    assertCheck(Number(post.ledger_exists) === Number(audit.ledger_exists), 'dry-run dejó ledger persistente');
    console.log(JSON.stringify({
        status: 'MODULE4_DRY_RUN_PASS',
        preflight: 'PASS_TRANSACTIONAL',
        persistent_sales_change: 0,
        persistent_journal_change: 0,
        transaction_rolled_back: true,
        ready_for_commit: true,
    }, null, 2));
}
