/**
 * E2E — login cloud → PIN → apertura de caja → mesa → orden → cobro →
 * cierre de caja → cierre de sesión cloud.
 *
 * Requiere una cuenta y datos de prueba dedicados. Nunca uses credenciales de
 * operadores reales en este archivo.
 *
 * Variables requeridas:
 *   E2E_CLOUD_EMAIL, E2E_CLOUD_PASSWORD, E2E_STAFF_PIN
 *   E2E_TABLE_NAME, E2E_PRODUCT_NAME
 *
 * Opcionales:
 *   E2E_STAFF_NAME       nombre visible de la tarjeta de operador
 *   E2E_BASE_URL         URL de Vite ya levantada (default 127.0.0.1:4173)
 *   E2E_START_SERVER     false para no iniciar Vite automáticamente
 *   E2E_OPENING_USD      fondo inicial USD (default 0)
 *   E2E_OPENING_BS       fondo inicial Bs (default 0)
 *   PLAYWRIGHT_EXECUTABLE_PATH
 *
 * Ejecutar:
 *   bun scripts/test-e2e-flow.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

function loadEnvFile() {
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

const fileEnv = loadEnvFile();
const env = { ...fileEnv, ...process.env };
const required = ['E2E_CLOUD_EMAIL', 'E2E_CLOUD_PASSWORD', 'E2E_STAFF_PIN', 'E2E_TABLE_NAME', 'E2E_PRODUCT_NAME'];
const missing = required.filter(key => !env[key]);
if (missing.length > 0) {
    console.log(`SKIP: faltan variables E2E dedicadas: ${missing.join(', ')}.`);
    process.exit(0);
}

function findBrowserExecutable() {
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

const executablePath = findBrowserExecutable();
if (!executablePath) {
    console.log('SKIP: no se encontró Chromium/Chrome. Configura PLAYWRIGHT_EXECUTABLE_PATH para ejecutar E2E.');
    process.exit(0);
}

function assertCheck(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

async function isReachable(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
        return response.ok || response.status < 500;
    } catch {
        return false;
    }
}

const baseUrl = env.E2E_BASE_URL || 'http://127.0.0.1:4173';
let devServer = null;
if (!(await isReachable(baseUrl))) {
    if (env.E2E_START_SERVER === 'false') {
        throw new Error(`E2E_BASE_URL no responde: ${baseUrl}`);
    }
    const port = new URL(baseUrl).port || '4173';
    // El runner se ejecuta con Node para compatibilidad con Playwright. Usar
    // el mismo runtime para Vite evita depender de que `bun` esté en PATH.
    devServer = spawn(process.execPath, [
        path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'),
        '--host', '127.0.0.1',
        '--port', port,
    ], {
        cwd: process.cwd(),
        stdio: 'ignore',
        windowsHide: true,
    });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !(await isReachable(baseUrl))) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    assertCheck(await isReachable(baseUrl), `Vite no inició en ${baseUrl}`);
}

let browser = null;
let context = null;
let page = null;

function stopDevServer(server) {
    if (!server) return;
    if (process.platform === 'win32' && server.pid) {
        spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
        server.kill('SIGTERM');
    }
}

async function visible(locator) {
    try { return await locator.count() > 0 && await locator.first().isVisible(); } catch { return false; }
}

async function dismissFirstUseOverlays() {
    // Algunos overlays se montan después de que la sesión cloud termina de
    // hidratarse; hacer varios ciclos evita intentar clicar la UI debajo de un
    // overlay que apareció entre dos renders.
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const termsEnd = page.locator('#terms-end');
        if (await visible(termsEnd)) {
            // TermsOverlay habilita el botón únicamente desde su contenedor de
            // scroll; scrollIntoView por sí solo no siempre dispara onScroll en
            // Chromium headless.
            await termsEnd.evaluate(element => {
                const scroller = element.closest('[class*="overflow-y-auto"]') || element.parentElement;
                if (!scroller) return;
                scroller.scrollTop = scroller.scrollHeight;
                scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            });
            const accept = page.getByRole('button', { name: /Acepto los Términos y Condiciones/i });
            await accept.waitFor({ state: 'visible' });
            await page.waitForFunction(() => [...document.querySelectorAll('button')]
                .some(button => /Acepto los Términos y Condiciones/i.test(button.textContent || '') && !button.disabled));
            await accept.click();
        }

        const onboardingSkip = page.getByRole('button', { name: 'Omitir', exact: true });
        if (await visible(onboardingSkip)) await onboardingSkip.click();

        const tourSkip = page.getByRole('button', { name: 'Saltar tour', exact: true });
        if (await visible(tourSkip)) await tourSkip.click();
        await page.waitForTimeout(250);
    }
}

async function clickExactIn(locator, name) {
    const target = locator.getByRole('button', { name, exact: true }).last();
    await target.waitFor({ state: 'visible' });
    await target.click();
}

async function getTableCard() {
    const heading = page.getByRole('heading', { name: env.E2E_TABLE_NAME, exact: true }).first();
    await heading.waitFor({ state: 'visible' });
    return heading.locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
}

try {
    browser = await chromium.launch({
        headless: env.E2E_HEADLESS !== 'false',
        executablePath,
        timeout: 30_000,
        args: ['--disable-gpu'],
    });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    // Cloud login.
    await page.getByPlaceholder('Correo electrónico').fill(env.E2E_CLOUD_EMAIL);
    await page.getByPlaceholder('Contraseña').fill(env.E2E_CLOUD_PASSWORD);
    await page.getByRole('button', { name: /Conectar Punto de Venta/i }).click();

    // Local operator login by PIN.
    const staffName = env.E2E_STAFF_NAME;
    const staffCard = staffName
        ? page.locator('h3').filter({ hasText: staffName }).first()
        : page.locator('h3').first();
    await staffCard.waitFor({ state: 'visible' });
    await staffCard.click();

    const pinPrompt = page.getByText(/Ingresa tu PIN de \d+ dígitos/).first();
    await pinPrompt.waitFor({ state: 'visible' });
    const prompt = await pinPrompt.innerText();
    const expectedPinLength = Number(prompt.match(/PIN de (\d+)/)?.[1] || env.E2E_STAFF_PIN.length);
    assertCheck(env.E2E_STAFF_PIN.length === expectedPinLength, `el PIN E2E debe tener ${expectedPinLength} dígitos`);
    for (const digit of env.E2E_STAFF_PIN) {
        await page.getByRole('button', { name: digit, exact: true }).last().click();
    }

    await dismissFirstUseOverlays();
    await page.locator('[data-tour="apertura-caja"]').waitFor({ state: 'visible' });

    // Apertura de caja.
    await page.locator('[data-tour="apertura-caja"]').click();
    const apertura = page.locator('div.fixed.inset-0').filter({ hasText: 'Apertura de Caja' }).last();
    await apertura.waitFor({ state: 'visible' });
    const openingInputs = apertura.locator('input[type="number"]');
    await openingInputs.nth(0).fill(env.E2E_OPENING_USD || '0');
    await openingInputs.nth(1).fill(env.E2E_OPENING_BS || '0');
    await clickExactIn(apertura, 'Aperturar Caja');
    await page.waitForTimeout(500);

    // Mesa.
    await page.locator('[data-tour="tab-mesas"]').click();
    await dismissFirstUseOverlays();
    const tableCard = await getTableCard();
    const openButton = tableCard.getByRole('button', { name: /Abrir Mesa|Ocupar/, exact: true });
    await openButton.click();

    const openWizard = page.locator('div[role="dialog"]').last();
    if (await visible(page.getByText('Abrir Mesa', { exact: true }).last())) {
        const continueButton = page.getByRole('button', { name: 'Continuar', exact: true }).last();
        if (await visible(continueButton)) {
            await continueButton.click();
            const porHora = page.getByText('Por Hora', { exact: true });
            if (await visible(porHora)) {
                await porHora.click();
                await page.getByRole('button', { name: /^(1)\s*HRS$/ }).click();
                await page.getByRole('button', { name: 'Continuar', exact: true }).last().click();
                await clickExactIn(page.locator('body'), 'Abrir Mesa');
            } else {
                await clickExactIn(page.locator('body'), 'Abrir Mesa');
            }
        } else {
            // Normal/bar table: step 1 opens directly.
            await clickExactIn(page.locator('body'), 'Ocupar Mesa');
        }
    }

    // Confirm dialog generated by useConfirm after the wizard. Esperar el
    // mensaje evita capturar el botón del wizard justo antes de que se
    // desmonte.
    const confirmMessage = page.getByText(/¿Confirmar apertura/, { exact: false }).last();
    if (await visible(confirmMessage)) {
        const confirmDialog = confirmMessage.locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
        const confirmOpen = confirmDialog.getByRole('button', { name: /^(Abrir Mesa|Ocupar Mesa)$/ }).last();
        await confirmOpen.waitFor({ state: 'visible' });
        await confirmOpen.click();
    }

    let activeTable = await getTableCard();
    await activeTable.getByRole('button', { name: 'Consumo', exact: true }).waitFor({ state: 'visible' });

    // Add one product to the table order.
    await activeTable.getByRole('button', { name: 'Consumo', exact: true }).click();
    const orderPanel = page.locator('div.fixed.inset-y-0.right-0').filter({ hasText: 'Consumo' }).last();
    await orderPanel.waitFor({ state: 'visible' });
    await orderPanel.getByPlaceholder('Buscar producto...').fill(env.E2E_PRODUCT_NAME);
    const addProduct = orderPanel.getByRole('button', { name: new RegExp(`^Agregar ${env.E2E_PRODUCT_NAME}$`, 'i') }).first();
    if (!(await visible(addProduct))) {
        const fallbackProduct = orderPanel.getByRole('button', { name: /^Agregar / }).first();
        await fallbackProduct.waitFor({ state: 'visible' });
        await fallbackProduct.click();
    } else {
        await addProduct.click();
    }
    await orderPanel.getByText(/En la mesa · 1 item/).waitFor({ state: 'visible' });
    await orderPanel.locator('button').first().click();

    // Offline/reconnection contract: force the browser offline, verify the app
    // exposes the offline state, then restore connectivity before checkout.
    await context.setOffline(true);
    await page.waitForTimeout(300);
    const offlineIndicator = page.getByText(/sin conexi[oó]n|offline/i).first();
    assertCheck(await visible(offlineIndicator), 'la UI no refleja la pérdida de conexión');
    await context.setOffline(false);
    await page.waitForTimeout(500);

    // Send the table order to cashier and process its payment.
    activeTable = await getTableCard();
    await activeTable.getByRole('button', { name: 'Cobrar', exact: true }).waitFor({ state: 'visible' });
    await activeTable.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await page.locator('[data-tour="tab-ventas"]').click();
    await dismissFirstUseOverlays();
    await page.getByText('Cuentas Pendientes de Cobro', { exact: true }).waitFor({ state: 'visible' });
    const pendingRow = page.getByRole('button').filter({ hasText: env.E2E_TABLE_NAME }).last();
    await pendingRow.click();

    const bill = page.locator('div.fixed.inset-0').filter({ hasText: 'Total a Cobrar' }).last();
    await bill.waitFor({ state: 'visible' });
    await bill.getByRole('button', { name: /^Cobrar/ }).last().click();

    const checkout = page.locator('div.fixed.inset-0').filter({ hasText: 'COBRAR' }).last();
    await checkout.waitFor({ state: 'visible' });
    await dismissFirstUseOverlays();
    await checkout.locator('[data-tour="checkout-usd"]').getByRole('button', { name: 'Total', exact: true }).first().click();
    await checkout.getByRole('button', { name: 'CONFIRMAR VENTA', exact: true }).click();

    const postPaymentMessage = page.getByText(/¿Qué deseas hacer con/).last();
    await postPaymentMessage.waitFor({ state: 'visible' });
    const postPaymentDialog = postPaymentMessage.locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
    await postPaymentDialog.getByRole('button', { name: 'Liberar Mesa', exact: true }).click();
    await postPaymentDialog.waitFor({ state: 'hidden' }).catch(() => {});

    // El checkout muestra además el recibo; cerrarlo es parte del flujo antes
    // de navegar al Dashboard para cerrar la caja.
    const receipt = page.locator('div.fixed.inset-0').filter({ hasText: 'Detalle de Consumo' }).last();
    if (await visible(receipt)) {
        await receipt.getByRole('button', { name: 'Nueva Venta', exact: true }).click();
        await receipt.waitFor({ state: 'hidden' }).catch(() => {});
    }

    // Close the cash session.
    await page.locator('[data-tour="tab-inicio"]').click();
    await page.locator('[data-tour="cierre-turno"]').waitFor({ state: 'visible' });
    await page.locator('[data-tour="cierre-turno"]').click();
    const cierre = page.locator('div.fixed.inset-0').filter({ hasText: 'Cierre de Caja' }).last();
    await cierre.waitFor({ state: 'visible' });
    await cierre.getByRole('button', { name: /Continuar al Conteo/ }).click();
    const countInputs = cierre.locator('input[type="number"]');
    await countInputs.nth(0).fill('0');
    await countInputs.nth(1).fill('0');
    await cierre.getByRole('button', { name: /Calcular/ }).click();
    await cierre.getByRole('button', { name: 'Confirmar Cierre', exact: true }).click();

    // Cloud logout.
    const logout = page.getByRole('button', { name: /Salir/ }).first();
    await logout.waitFor({ state: 'visible' });
    await logout.click();
    const confirmLogout = page.getByRole('button', { name: 'Cerrar sesión', exact: true }).last();
    if (await visible(confirmLogout)) await confirmLogout.click();
    await page.getByRole('button', { name: 'Conectar Punto de Venta', exact: true }).waitFor({ state: 'visible' });
    assertCheck(await page.evaluate(() => !localStorage.getItem('pool_pending_table_actions')), 'quedaron acciones de mesa pendientes tras reconectar');

    console.log('PASS: E2E cloud login → PIN → caja → mesa → orden → offline/reconexión → cobro → cierre → logout.');
} catch (error) {
    await page?.screenshot({ path: 'e2e-flow-failure.png', fullPage: true }).catch(() => {});
    throw error;
} finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    stopDevServer(devServer);
}
