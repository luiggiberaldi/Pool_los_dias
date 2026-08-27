/**
 * Test determinista — FLUJO DE REPORTES E2E
 * Cubre: calculateReportsData (rango fechas + turno), groupSalesByCierreId,
 * historial sin operaciones de caja fantasma, desglose de pagos neto de vuelto,
 * normalizeDateRange, getSaleBs y revertCustomerImpact (anulaciones).
 *
 * Run: bun run test:reports-flow
 */
import { FinancialEngine } from '../src/core/FinancialEngine.js';
import { calculateReportsData, groupSalesByCierreId } from '../src/utils/reportsProcessor.js';
import { normalizeDateRange, getLocalISODate } from '../src/utils/dateHelpers.js';
import { revertCustomerImpact } from '../src/utils/financialLogic.js';
import { getSaleBs } from '../src/utils/calculatorUtils.js';

let passed = 0;
let failed = 0;
const ok = (cond, label) => {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; console.error(`  ❌ ${label}`); }
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const NOW = new Date();
const TODAY = getLocalISODate(NOW);
const CIERRE_ID = Date.parse(`${getLocalISODate(NOW)}T20:00:00`); // cierre hoy 8pm
const ts = (msAgo) => new Date(NOW.getTime() - msAgo * 60000).toISOString();

// ── Dataset maestro (un turno completo con todos los tipos de registro) ──
const apertura = {
    id: 'ap_1', tipo: 'APERTURA_CAJA', cierreId: CIERRE_ID,
    openingUsd: 50, openingBs: 300, timestamp: ts(480), cajaCerrada: false,
};
const ventaUsdVuelto = {
    id: 'v_1', tipo: 'VENTA', status: 'COMPLETADA', cierreId: CIERRE_ID,
    timestamp: ts(300), totalUsd: 10, totalBs: 8000, rate: 800,
    payments: [{ methodId: 'efectivo_usd', currency: 'USD', amount: 20, amountInput: 20, amountUsd: 20 }],
    changeUsd: 10,
    items: [{ name: 'Protectores', qty: 2, priceUsd: 5, category: 'cervezas' }],
};
const ventaBsVuelto = {
    id: 'v_2', tipo: 'VENTA', status: 'COMPLETADA', cierreId: CIERRE_ID,
    timestamp: ts(240), totalUsd: 5, totalBs: 500, rate: 800, // precio dual: Bs 500 fijos
    payments: [{ methodId: 'efectivo_bs', currency: 'BS', amount: 600, amountInput: 600, amountBs: 600 }],
    changeBs: 100,
    items: [{ name: 'La Piña', qty: 1, priceUsd: 0.5, category: 'mesas' }],
};
const ventaAnulada = {
    id: 'v_3', tipo: 'VENTA', status: 'ANULADA', cierreId: CIERRE_ID,
    timestamp: ts(180), totalUsd: 7, totalBs: 5600, rate: 800,
    payments: [{ methodId: 'efectivo_bs', currency: 'BS', amount: 700, amountInput: 700, amountBs: 700 }],
    items: [{ name: 'Fantasma', qty: 1, priceUsd: 7, category: 'cervezas' }],
};
const ventaFiada = {
    id: 'v_4', tipo: 'VENTA_FIADA', status: 'COMPLETADA', cierreId: CIERRE_ID,
    timestamp: ts(120), totalUsd: 5, totalBs: 4000, rate: 800, fiadoUsd: 5, customerId: 'c1',
    items: [{ name: 'Credito: c1', qty: 1, priceUsd: 5, costBs: 0 }],
};
const cobroDeuda = {
    id: 'v_5', tipo: 'COBRO_DEUDA', status: 'COMPLETADA', cierreId: CIERRE_ID,
    timestamp: ts(60), totalUsd: 3, totalBs: 2400, rate: 800, clienteId: 'c1',
    paymentMethod: 'pago_movil',
    payments: [{ methodId: 'pago_movil', currency: 'BS', amount: 2400, amountInput: 2400, amountUsd: 3, amountBs: 2400 }],
    items: [{ name: 'Abono de deuda: c1', qty: 1, priceUsd: 3, costBs: 0 }],
};
const ajuste = { id: 'aj_1', tipo: 'AJUSTE_ENTRADA', cierreId: CIERRE_ID, timestamp: ts(400), totalUsd: 0 };
const cierreCaja = { id: 'ci_1', tipo: 'CIERRE_CAJA', cierreId: CIERRE_ID, timestamp: ts(30), totalUsd: 0 };

const ALL_SALES = [apertura, ventaUsdVuelto, ventaBsVuelto, ventaAnulada, ventaFiada, cobroDeuda, ajuste, cierreCaja];

// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 1 — Reportes por rango de fechas (Hoy)');
const R = calculateReportsData(ALL_SALES, TODAY, TODAY, 800, [], 'today', null);

ok(R.salesForStats.length === 3, 'Stats: 3 ventas (anulada y operaciones de caja fuera)');
ok(round2(R.totalUsd) === 20, `Total $ = 20 (10 + 5 + 5 fiada) — got ${R.totalUsd}`);
ok(round2(R.totalBs) === 12500, `Total Bs = 12.500 (8000 + 500 dual + 4000) — got ${R.totalBs}`);
ok(R.historySales.length === 5, `Historial: 5 registros (sin APERTURA/CIERRE/AJUSTE fantasma) — got ${R.historySales.length}`);
ok(!R.historySales.some(s => s.tipo === 'APERTURA_CAJA' || s.tipo === 'CIERRE_CAJA' || s.tipo === 'AJUSTE_ENTRADA'), 'Historial no lista operaciones de caja');
ok(R.historySales.some(s => s.status === 'ANULADA'), 'Historial sí muestra la anulada (con filtro visual)');

const bd = R.paymentBreakdown;
ok(bd['efectivo_usd']?.total === 20, 'Desglose: efectivo_usd = $20 bruto');
ok(bd['_vuelto_usd']?.total === -10, 'Desglose: vuelto USD = -$10 (bucket negativo)');
ok(bd['efectivo_bs']?.total === 600, `Desglose: efectivo_bs = 600 bruto (solo la venta; el abono va a pago_movil) — got ${bd['efectivo_bs']?.total}`);
ok(bd['_vuelto_bs']?.total === -100, 'Desglose: vuelto Bs = -100');
ok(bd['fiado']?.total === 2, `Desglose: fiado neto = $2 (5 fiada - 3 abonada) — got ${bd['fiado']?.total}`);
ok(bd['pago_movil']?.total === 2400, 'Desglose: pago_movil registra el abono en Bs');

const topP = R.topProducts.find(p => p.name === 'Protectores');
ok(topP && topP.qty === 2, 'Top productos incluye ventas válidas');
ok(!R.topProducts.some(p => p.name === 'Fantasma'), 'Top productos EXCLUYE la anulada');
ok(R.salesByDay.length === 1 && R.salesByDay[0].date === TODAY, 'Ventas por día agrupadas bajo hoy');

console.log('\nFASE 2 — Tarjetas de cierre (groupSalesByCierreId)');
const groups = groupSalesByCierreId(ALL_SALES, TODAY, TODAY);
ok(groups.length === 1, '1 grupo de cierre en el rango');
const g = groups[0];
ok(!!g.apertura && !!g.cierreRecord, 'Grupo vincula apertura y registro de cierre');
ok(round2(g.totalUsd) === 20, `Cierre: total $ = 20 SIN la anulada — got ${g.totalUsd}`);
ok(round2(g.totalBs) === 12500, 'Cierre: total Bs = 12.500 sin la anulada');
ok(!g.salesForStats.some(s => s.status === 'ANULADA'), 'Cierre: stats excluyen ANULADA');
ok(!g.salesForCashFlow.some(s => s.status === 'ANULADA'), 'Cierre: cashflow excluye ANULADA');
ok(g.paymentBreakdown['efectivo_bs']?.total === 600, 'Cierre: desglose Bs sin pagos de anulada');
ok(g.paymentBreakdown['fiado']?.total === 2, 'Cierre: fiado neto $2');
ok(g.paymentBreakdown['_vuelto_bs']?.total === -100, 'Cierre: vuelto Bs del turno presente');

console.log('\nFASE 3 — Reporte por TURNO (shift)');
const session = { opened_at: ts(210) }; // abre hace 3.5h
const S = calculateReportsData(ALL_SALES, TODAY, TODAY, 800, [], 'shift', session);
// Ventas después de apertura y sin cajaCerrada: v_2 (240m... ANTES de 210m? no: ts(240) es más viejo que opened_at ts(210))
// Revisemos: opened_at = NOW-210m. v_1=NOW-300 (antes), v_2=NOW-240 (antes), v_4=NOW-120 (después), v_5=NOW-60 (después), anulada=NOW-180 (después).
ok(round2(S.totalUsd) === 5, `Shift: solo la fiada post-apertura cuenta ($5) — got ${S.totalUsd}`);
ok(S.salesForStats.every(s => !s.cajaCerrada), 'Shift: ventas de caja cerrada excluidas');
ok(!S.salesForStats.some(s => s.status === 'ANULADA'), 'Shift: anuladas excluidas de stats');

const S2 = calculateReportsData(
    [...ALL_SALES, { id: 'v_9', tipo: 'VENTA', status: 'COMPLETADA', timestamp: ts(10), totalUsd: 8, totalBs: 6400, rate: 800, cajaCerrada: true, payments: [{ methodId: 'efectivo_usd', currency: 'USD', amount: 8, amountUsd: 8, amountInput: 8 }] }],
    TODAY, TODAY, 800, [], 'shift', session
);
ok(!S2.salesForStats.some(s => s.id === 'v_9'), 'Shift: venta con cajaCerrada=true fuera del turno vivo');

console.log('\nFASE 4 — Rango personalizado (normalizeDateRange)');
const inv = normalizeDateRange('2026-08-20', '2026-08-10');
ok(inv.from === '2026-08-10' && inv.to === '2026-08-20', 'Rango invertido se normaliza (Desde > Hasta)');
const empty = normalizeDateRange(undefined, undefined);
ok(empty.from === TODAY && empty.to === TODAY, 'Rango vacío cae a hoy');
const half = normalizeDateRange('2026-08-10', undefined);
ok(half.from === '2026-08-10' && half.to === '2026-08-10', 'Solo "Desde": rango de un día');

console.log('\nFASE 5 — Anulaciones: revertCustomerImpact (inversa exacta)');
// 5.1 Crédito manual (clienteId) — antes NO revertía nada
const cFiado = revertCustomerImpact({ deuda: 10, favor: 0 }, { tipo: 'VENTA_FIADA', totalUsd: 5, fiadoUsd: 5 });
ok(cFiado.deuda === 5 && cFiado.favor === 0, 'Fiado manual anulado: deuda 10 → 5');

// 5.2 Abono parcial: deuda 10, abono 3 → deuda 7; anular abono → deuda 10 exacta
const cAbono = revertCustomerImpact({ deuda: 7, favor: 0 }, { tipo: 'COBRO_DEUDA', totalUsd: 3 });
ok(cAbono.deuda === 10 && cAbono.favor === 0, 'Abono anulado: deuda 7 → 10 (restaurada exacta)');

// 5.3 Abono con excedente a favor: deuda 2, abono 3 → deuda 0 favor 1; anular → deuda 2 favor 0
const cOverflow = revertCustomerImpact({ deuda: 0, favor: 1 }, { tipo: 'COBRO_DEUDA', totalUsd: 3 });
ok(cOverflow.deuda === 2 && cOverflow.favor === 0, 'Abono con excedente anulado: inversa neta exacta (deuda 2, favor 0)');

// 5.4 Pago con saldo a favor anulado → favor restaurado
const cFavor = revertCustomerImpact({ deuda: 0, favor: 3 }, { tipo: 'VENTA', payments: [{ methodId: 'saldo_favor', amountUsd: 2 }], totalUsd: 2 });
ok(cFavor.favor === 5 && cFavor.deuda === 0, 'Pago con saldo a favor anulado: favor 3 → 5');

// 5.5 Venta normal sin impacto en cliente → intacto
const cClean = revertCustomerImpact({ deuda: 4, favor: 2 }, { tipo: 'VENTA', totalUsd: 9, payments: [{ methodId: 'efectivo_usd', amountUsd: 9, currency: 'USD' }] });
ok(cClean.deuda === 4 && cClean.favor === 2, 'Venta contado anulada: cliente intacto');

console.log('\nFASE 6 — Coherencia Bs en filas del historial (getSaleBs)');
ok(getSaleBs(ventaBsVuelto) === 500, `Venta con vuelto: fila muestra Bs 500 (NO los 600 entregados) — got ${getSaleBs(ventaBsVuelto)}`);
ok(getSaleBs(ventaAnulada) === 0, 'Venta anulada: Bs = 0 en fila');
ok(getSaleBs(ventaUsdVuelto) === 8000, `Venta USD con vuelto: Bs por tasa aplicada (10×800) — got ${getSaleBs(ventaUsdVuelto)}`);

// ════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════');
if (failed === 0) {
    console.log(`✅ PASS: ${passed}/${passed} invariantes del flujo de reportes verificadas`);
    process.exit(0);
} else {
    console.error(`❌ FAIL: ${failed} invariantes rotas de ${passed + failed}`);
    process.exit(1);
}
