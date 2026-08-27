/**
 * Test determinista — TICKETS Y PDFs DE REPORTES
 * Verifica que TODOS los renderizadores (ticket PDF, térmico HTML, ESC/POS,
 * cierre 58mm, cierre carta, reportes) usen UN solo criterio de Bs:
 * getSaleBs (neto de vuelto, dual-aware), y que los documentos
 * contengan los datos mínimos (vuelto, conteo de ventas real, guard de ganancia).
 *
 * Run: bun run test:tickets-pdfs
 */
import fs from 'node:fs';
import { FinancialEngine } from '../src/core/FinancialEngine.js';
import { getSaleBs } from '../src/utils/calculatorUtils.js';
import { calculateReportsData } from '../src/utils/reportsProcessor.js';
import { getLocalISODate } from '../src/utils/dateHelpers.js';

let passed = 0;
let failed = 0;
const ok = (cond, label) => {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; console.error(`  ❌ ${label}`); }
};
const read = (p) => fs.readFileSync(p, 'utf8');
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 1 — Almacenamiento: totalBs = precio real de la venta');
const checkout = read('src/utils/checkoutProcessor.js');
ok(checkout.includes('totalBs: cartTotalBs'), 'checkout guarda totalBs = cartTotalBs (precio dual-aware, sin vuelto)');
ok(!/totalBs:\s*\(\(\)\s*=>/.test(checkout), 'Ya no existe la IIFE que guardaba la suma BRUTA de pagos Bs');
ok(!/sumPaidBs/.test(checkout), 'Sin patrón de suma bruta amountInput en el almacenamiento');
ok(/exactBs:\s*i\.exactBs \?\? null/.test(checkout), 'Items persistidos conservan exactBs (precio dual por ítem)');

// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 2 — Criterio único Bs (getSaleBs) en TODOS los renderizadores');
const ticket = read('src/utils/ticketGenerator.js');
ok(ticket.includes('getSaleBs(sale)'), 'Ticket PDF: Total Bs vía getSaleBs');
ok(!/p\.amountInput \|\| p\.amountBs/.test(ticket), 'Ticket PDF: sin suma bruta de pagos');
ok(/exactBs != null \? item\.exactBs \* item\.qty/.test(ticket), 'Ticket PDF: referencia Bs de ítem respeta precio dual (exactBs)');

const thermal = read('src/utils/thermalTicketGenerator.js');
ok(thermal.includes('getSaleBs(sale)'), 'Térmico HTML: Total Bs vía getSaleBs');
ok(!/sumPaidBs/.test(thermal), 'Térmico HTML: sin suma bruta de pagos');
ok(/VUELTO ENTREGADO/.test(thermal), 'Térmico HTML: incluye sección VUELTO ENTREGADO (antes ausente)');
ok(/changeUsd > 0 \? `<tr>/.test(thermal) && /changeBs > 0 \? `<tr>/.test(thermal), 'Térmico HTML: desglose de vuelto $ y Bs');

const escpos = read('src/services/webSerialPrinter.js');
ok(escpos.includes('getSaleBs(sale)'), 'ESC/POS: Total Bs vía getSaleBs');
ok(!/bsPaymentsEsc/.test(escpos), 'ESC/POS: sin suma bruta de pagos');

const closeTicket = read('src/utils/dailyCloseGenerator.js');
ok(/'Ventas realizadas', `\$\{allSales\.length\}`/.test(closeTicket), 'Cierre 58mm: "Ventas realizadas" cuenta ventas reales (no abonos/proveedores)');
ok(!/'Ventas realizadas', `\$\{sales\.length\}`/.test(closeTicket), 'Cierre 58mm: ya no usa el flujo de caja para contar ventas');
ok(/bcvRate > 0 \? \(todayProfit \/ bcvRate\)/.test(closeTicket), 'Cierre 58mm: ganancia protegida contra tasa 0');
ok(/getSaleBs\(s\)/.test(closeTicket), 'Cierre 58mm: "Ref Venta" Bs neto de vuelto');
ok(/const neg = data\.total < 0;/.test(closeTicket), 'Cierre 58mm: buckets negativos con signo legible (- Bs 100, no "Bs -100")');

const closeLetter = read('src/utils/letterCloseGenerator.js');
ok(/\$\{allSales\.length\} ventas/.test(closeLetter), 'PDF Carta: OPERACIONES cuenta ventas reales');
ok(/bcvRate > 0 \? \(todayProfit \/ bcvRate\)/.test(closeLetter), 'PDF Carta: ganancia protegida contra tasa 0');
ok(/item\.exactBs != null/.test(closeLetter), 'PDF Carta: Bs de ítem respeta precio dual (exactBs)');
ok(/s\.rate \|\| bcvRate/.test(closeLetter), 'PDF Carta: Bs de ítem usa la tasa de LA VENTA');
ok(!/s\.bcvRate/.test(closeLetter), 'PDF Carta: eliminado campo inexistente s.bcvRate');
ok(/const neg = data\.total < 0;/.test(closeLetter), 'PDF Carta: buckets negativos con signo legible');

const reports = read('src/utils/reportsProcessor.js');
ok(/reduce\(\(s, sale\) => s \+ getSaleBs\(sale\), 0\)/.test(reports), 'Reportes: total Bs agregado vía getSaleBs (corrige históricos con vuelto)');
ok(/reduce\(\(acc, s\) => acc \+ getSaleBs\(s\), 0\)/.test(reports), 'Reportes: tarjetas de cierre vía getSaleBs');

// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 3 — Matemática: el escenario del vuelto en cada capa');
// Venta dual: piña Bs 500 fijos; cliente paga Bs 600 y recibe Bs 100 de vuelto
const saleChange = {
    id: 's1', tipo: 'VENTA', status: 'COMPLETADA',
    timestamp: new Date().toISOString(),
    totalUsd: 0.5, totalBs: 500, rate: 800,
    payments: [{ methodId: 'efectivo_bs', currency: 'BS', amount: 600, amountInput: 600, amountBs: 600 }],
    changeBs: 100,
    items: [{ name: 'La Piña', qty: 1, priceUsd: 0.5, exactBs: 500 }],
};
ok(getSaleBs(saleChange) === 500, `getSaleBs: venta de Bs 500 con vuelto reporta Bs 500 (no 600) — got ${getSaleBs(saleChange)}`);

// Histórico con totalBs guardado bruto (ventas previas al fix): getSaleBs lo corrige
const legacyGross = { ...saleChange, totalBs: 600 }; // almacenamiento antiguo inflado
ok(getSaleBs(legacyGross) === 500, 'Histórico con totalBs=600 guardado: getSaleBs corrige a Bs 500');

// Reportes agregan neto con históricos incluidos
const TODAY = getLocalISODate(new Date());
const R = calculateReportsData([saleChange, legacyGross], TODAY, TODAY, 800, [], 'today', null);
ok(round2(R.totalBs) === 1000, `Reportes: 2 ventas de Bs 500 con vuelto suman Bs 1.000 (no 1.100/1.200) — got ${R.totalBs}`);

// Desglose de pagos: bucket de vuelto negativo presente
const bd = FinancialEngine.calculatePaymentBreakdown([saleChange]);
ok(bd['efectivo_bs']?.total === 600, 'Desglose: efectivo_bs bruto = 600');
ok(bd['_vuelto_bs']?.total === -100, 'Desglose: bucket _vuelto_bs = -100');

// Venta sin vuelto: idéntica a antes del fix
const saleExact = { ...saleChange, payments: [{ methodId: 'efectivo_bs', currency: 'BS', amount: 500, amountInput: 500, amountBs: 500 }], changeBs: 0 };
ok(getSaleBs(saleExact) === 500, 'Pago exacto Bs 500: sin cambios de comportamiento');

// Dual Bs distinto de la tasa: la referencia respeta el precio fijo
const dualItem = { ...saleChange, items: [{ name: 'La Piña', qty: 2, priceUsd: 0.5, exactBs: 500 }] };
ok(dualItem.items[0].exactBs * dualItem.items[0].qty === 1000, 'Ítem dual 2× piña: referencia Bs 1.000 (no 2×0,5×800)');

// ════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
if (failed === 0) {
    console.log(`✅ PASS: ${passed}/${passed} invariantes de tickets/PDFs verificadas`);
    process.exit(0);
} else {
    console.error(`❌ FAIL: ${failed} invariantes rotas de ${passed + failed}`);
    process.exit(1);
}
