/**
 * Módulo 1 — E2E autocontenido en el proyecto Supabase actual.
 *
 * No usa staging ni credenciales existentes. Antes del navegador crea una cuenta
 * Auth efímera, operador, producto, mesa, configuración y licencia con prefijo
 * _M1E2E_. Al terminar elimina únicamente las filas y el usuario creados por
 * esta ejecución. Nunca escribe credenciales en .env ni en archivos del repo.
 *
 * Requiere en .env: SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN,
 * VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

function loadEnv() {
    const values = {};
    if (!fs.existsSync('.env')) return values;
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
    if (!condition) throw new Error(message);
}

function findBrowserExecutable(env) {
    if (env.PLAYWRIGHT_EXECUTABLE_PATH && fs.existsSync(env.PLAYWRIGHT_EXECUTABLE_PATH)) {
        return env.PLAYWRIGHT_EXECUTABLE_PATH;
    }
    const candidates = process.platform === 'win32'
        ? [
            path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
            path.join(env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
            path.join(env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
            path.join(env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
            path.join(env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
        ]
        : process.platform === 'darwin'
            ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
            : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
    return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

// El .env del checkout es la fuente de verdad para estas credenciales; evita
// que una variable heredada del proceso o de otro proyecto apunte a otro token.
const env = { ...process.env, ...loadEnv() };
const required = ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
for (const key of required) assertCheck(env[key], `Falta ${key}`);

const executablePath = findBrowserExecutable(env);
if (!executablePath) {
    console.log('SKIP: no se encontró Chromium/Chrome/Edge; no se creó ninguna fixture E2E.');
    process.exit(0);
}

const managementEndpoint = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
const apiBase = env.VITE_SUPABASE_URL.replace(/\/$/, '');
let serviceRoleKey = null;
let fixture = null;

async function managementQuery(sql) {
    const response = await fetch(managementEndpoint, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 600)}`);
    return text ? JSON.parse(text) : null;
}

async function resolveServiceRoleKey() {
    const response = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/api-keys`, {
        headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`No se pudo consultar la API key service_role (${response.status}).`);
    const row = Array.isArray(body) ? body.find(item => item.name === 'service_role') : null;
    assertCheck(row?.api_key, 'El proyecto no devolvió una API key service_role utilizable.');
    return row.api_key;
}

async function supabaseRest(resource, options = {}) {
    const response = await fetch(`${apiBase}${resource}`, {
        ...options,
        headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            'content-type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase ${options.method || 'GET'} ${resource} ${response.status}: ${text.slice(0, 600)}`);
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
}

async function createFixture() {
    serviceRoleKey = await resolveServiceRoleKey();
    const suffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const prefix = `_M1E2E_${suffix}`;
    const email = `m1e2e.${suffix.toLowerCase()}@example.invalid`;
    const password = `M1e2e!${crypto.randomBytes(18).toString('base64url')}`;
    const pin = '246810';
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const userResponse = await supabaseRest('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: `${prefix} Cloud` },
        }),
    });
    const userId = userResponse?.user?.id || userResponse?.id;
    assertCheck(userId, 'Supabase Auth no devolvió el id del usuario E2E.');

    fixture = {
        prefix,
        email,
        password,
        pin,
        userId,
        staffId: crypto.randomUUID(),
        productId: crypto.randomUUID(),
        tableId: crypto.randomUUID(),
        deviceId: `m1e2e-device-${suffix}`,
    };

    try {
        await supabaseRest('/rest/v1/cloud_licenses', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                user_id: userId,
                email,
                device_id: fixture.deviceId,
                license_type: 'permanent',
                max_devices: 6,
                active: true,
                business_name: prefix,
            }),
        });
        await supabaseRest('/rest/v1/staff_users', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                id: fixture.staffId,
                user_id: userId,
                name: `${prefix} Operador`,
                role: 'ADMIN',
                pin_hash: pinHash,
                active: true,
            }),
        });
        await supabaseRest('/rest/v1/products', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                id: fixture.productId,
                user_id: userId,
                name: `${prefix} Producto`,
                stock: 100,
                price: 1,
                cost_price: 0.25,
                barcode: `${suffix}`,
                category: 'bebidas',
            }),
        });
        await supabaseRest('/rest/v1/tables', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                id: fixture.tableId,
                user_id: userId,
                name: `${prefix} Mesa`,
                type: 'NORMAL',
                status: 'libre',
                active: true,
            }),
        });
        await supabaseRest('/rest/v1/pool_config', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
                user_id: userId,
                price_per_hour: 5,
                price_per_hour_bs: 0,
                price_pina: 2,
                price_pina_bs: 0,
            }),
        });

        const productPayload = [{
            id: fixture.productId,
            name: `${prefix} Producto`,
            stock: 100,
            priceUsdt: 1,
            priceUsd: 1,
            price: 1,
            priceBs: 0,
            costUsd: 0.25,
            costPrice: 0.25,
            category: 'bebidas',
            lowStockAlert: 5,
            unit: 'unidad',
            sellByUnit: false,
        }];
        await supabaseRest('/rest/v1/sync_documents', {
            method: 'POST',
            headers: { Prefer: 'return=minimal', 'x-upsert': 'true' },
            body: JSON.stringify({
                user_id: userId,
                collection: 'store',
                doc_id: 'bodega_products_v1',
                data: { payload: productPayload },
            }),
        });
        return fixture;
    } catch (error) {
        await cleanupFixture().catch(() => {});
        throw error;
    }
}

async function cleanupPublicRows() {
    const uid = fixture.userId;
    // Las tablas hijas no tienen user_id propio; se eliminan por la relación con
    // la orden/venta/caja del fixture. El UUID fue generado localmente, no viene
    // de entrada de usuario, y se usa solo dentro de esta sentencia administrativa.
    await managementQuery(`
        BEGIN;
        DELETE FROM public.payments
        WHERE order_id IN (SELECT id FROM public.orders WHERE user_id = '${uid}'::uuid)
           OR cash_session_id IN (SELECT id FROM public.cash_sessions WHERE user_id = '${uid}'::uuid);
        DELETE FROM public.journal_entries
        WHERE transaction_id IN (SELECT id FROM public.sales WHERE user_id = '${uid}'::uuid);
        DELETE FROM public.inventory_adjustments
        WHERE sale_id IN (SELECT id FROM public.sales WHERE user_id = '${uid}'::uuid);
        DELETE FROM public.sale_items
        WHERE sale_id IN (SELECT id FROM public.sales WHERE user_id = '${uid}'::uuid);
        DELETE FROM public.order_items
        WHERE order_id IN (SELECT id FROM public.orders WHERE user_id = '${uid}'::uuid);
        DELETE FROM public.orders WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.table_sessions WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.cash_sessions WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.sales WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.staff_debt_payments
        WHERE debt_id IN (SELECT id FROM public.staff_debts WHERE user_id = '${uid}'::uuid);
        DELETE FROM public.staff_debts WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.sync_documents WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.cloud_backups WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.account_devices WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.pool_customers WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.products WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.tables WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.pool_config WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.cloud_licenses WHERE user_id = '${uid}'::uuid;
        DELETE FROM public.staff_users WHERE user_id = '${uid}'::uuid;
        COMMIT;
    `);
}

async function cleanupFixture() {
    if (!fixture || !serviceRoleKey) return;
    const cleanupUserId = fixture.userId;
    const failures = [];
    try {
        await cleanupPublicRows();
    } catch (error) {
        failures.push(`tablas públicas: ${error.message}`);
    }
    try {
        const response = await fetch(`${apiBase}/auth/v1/admin/users/${cleanupUserId}`, {
            method: 'DELETE',
            headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
        });
        if (!response.ok) failures.push(`auth.users: ${response.status}`);
    } catch (error) {
        failures.push(`auth.users: ${error.message}`);
    }
    fixture = null;
    if (failures.length > 0) throw new Error(`Limpieza E2E incompleta: ${failures.join('; ')}`);
}

function runChild(childEnv) {
    return new Promise((resolve, reject) => {
        // Playwright usa el canal de debugging de Chromium; Node es el runtime
        // soportado aquí (Bun puede quedarse esperando el remote-debugging-pipe).
        const child = spawn('node', ['scripts/test-e2e-flow.mjs'], {
            cwd: process.cwd(),
            env: childEnv,
            stdio: 'inherit',
            windowsHide: true,
        });
        child.on('error', reject);
        child.on('exit', code => resolve(code ?? 1));
    });
}

let testCode = 1;
let testError = null;
try {
    await createFixture();
    console.log('Fixture M1 E2E creada temporalmente en el proyecto actual.');
    testCode = await runChild({
        ...process.env,
        E2E_CLOUD_EMAIL: fixture.email,
        E2E_CLOUD_PASSWORD: fixture.password,
        E2E_STAFF_PIN: fixture.pin,
        E2E_STAFF_NAME: `${fixture.prefix} Operador`,
        E2E_TABLE_NAME: `${fixture.prefix} Mesa`,
        E2E_PRODUCT_NAME: `${fixture.prefix} Producto`,
        E2E_START_SERVER: env.E2E_START_SERVER || 'true',
        E2E_HEADLESS: env.E2E_HEADLESS || 'true',
        PLAYWRIGHT_EXECUTABLE_PATH: executablePath,
    });
    if (testCode !== 0) testError = new Error(`El runner E2E terminó con código ${testCode}.`);
} catch (error) {
    testError = error;
} finally {
    try {
        const hadFixture = Boolean(fixture);
        await cleanupFixture();
        console.log(hadFixture
            ? 'Limpieza E2E verificada: cuenta y fixtures temporales eliminados.'
            : 'No hubo fixtures E2E que limpiar.');
    } catch (error) {
        testError = testError || error;
        console.error(error.message);
    }
}

if (testError) {
    console.error(`FAIL: ${testError.message}`);
    process.exitCode = 1;
} else {
    console.log('PASS: Módulo 1 E2E en proyecto actual y limpieza verificada.');
}
