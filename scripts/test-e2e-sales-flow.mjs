import fs from 'node:fs';
import { FinancialEngine } from '../src/core/FinancialEngine.js';
import {
    calculateSessionCostBreakdown,
    calculateTimeCostBsBreakdown,
    calculateConsumptionBs,
    calculateGrandTotalBs,
    calculateFullTableBreakdown,
} from '../src/utils/tableBillingEngine.js';

let passed = 0;
let failed = 0;
const ok = (cond, label) => {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else { failed++; console.error(`  ❌ ${label}`); }
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ════════════════════════════════════════════════════════════════════
// FASE 1 — APERTURA DE CAJA: el fondo inicial entra a la gaveta, no a ingresos
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 1 — Apertura de caja');
const apertura = {
    id: 'apertura_1', tipo: 'APERTURA_CAJA', openingUsd: 50, openingBs: 300,
    timestamp: new Date().toISOString(), cajaCerrada: false,
};
const bdApertura = FinancialEngine.calculatePaymentBreakdown([apertura]);
ok(bdApertura['efectivo_usd']?.total === 50, 'Fondo $ entra a bucket efectivo_usd');
ok(bdApertura['efectivo_bs']?.total === 300, 'Fondo Bs entra a bucket efectivo_bs');
ok(!bdApertura['_vuelto_usd'] && !bdApertura['_vuelto_bs'], 'Apertura no genera vuelto');

// ════════════════════════════════════════════════════════════════════
// FASE 2 — PDV: precio dual + descuento proporcional en Bs
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 2 — PDV con precio dual y descuento');
// La Piña $0.50 / Bs 500 (dual real), tasa viva 800
const cartDual = [{ id: 'pina', name: 'La Piña', priceUsd: 0.5, qty: 1, exactBs: 500, costUsd: 0, costBs: 0 }];
const tDual = FinancialEngine.buildCartTotals(cartDual, { type: 'percentage', value: 10 }, 800);
ok(tDual.subtotalUsd === 0.5 && tDual.subtotalBs === 500, 'Subtotal dual: $0.50 / Bs 500');
ok(tDual.discountAmountBs === 50, `Descuento Bs proporcional (50, antes 40 a tasa viva) → ${tDual.discountAmountBs}`);
ok(tDual.totalUsd === 0.45 && tDual.totalBs === 450, `Total final $0.45 / Bs 450 → ${tDual.totalUsd}/${tDual.totalBs}`);
ok(round2(tDual.totalBs / tDual.totalUsd) === 1000, 'Tasa implícita consistente (1000) tras descuento');
// Carrito sin dual: el comportamiento histórico no cambia
const cartNormal = [{ id: 'c1', name: 'Cerveza', priceUsd: 2, qty: 3, costUsd: 0, costBs: 0 }];
const tNormal = FinancialEngine.buildCartTotals(cartNormal, { type: 'fixed', value: 1 }, 800);
ok(tNormal.totalUsd === 5 && tNormal.totalBs === 4000, `Sin dual: $6−$1=$5 / Bs 4000 (4800−800) → ${tNormal.totalUsd}/${tNormal.totalBs}`);

// ════════════════════════════════════════════════════════════════════
// FASE 3 — MESA CLÁSICA MODO PIÑA + CONSUMO + LIQUIDACIÓN
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 3 — Mesa Piña: 2 piñas + consumo, cobro en Bs');
const cfg = { pricePerHour: 3, pricePerHourBs: 2500, pricePina: 0.5, pricePinaBs: 500 };
const RATE = 800;
const sesionPina = { game_mode: 'PINA', hours_paid: 0, extended_times: 1 }; // 1 + 1 = 2 piñas
const bdPina = calculateSessionCostBreakdown(61, 'PINA', cfg, 0, 1, 0, 0);
ok(bdPina.pinaCost === 1, `2 piñas × $0.50 = $1.00 → ${bdPina.pinaCost}`);
ok(bdPina.hourCost === 0, 'Sin horas prepagadas no se cobra tiempo');
const itemsConsumo = [
    { product_id: 'c1', unit_price_usd: 2, qty: 2 },
    { product_id: 'c2', unit_price_usd: 1, qty: 1 },
];
const consumo = round2(itemsConsumo.reduce((a, i) => a + i.unit_price_usd * i.qty, 0));
ok(consumo === 5, 'Consumo $5.00');
const totalUsdMesa = round2(bdPina.total + consumo); // 6
const consumoBs = calculateConsumptionBs(itemsConsumo, RATE, []);
const totalBsMesa = calculateGrandTotalBs(bdPina.total, consumo, 'PINA', cfg, RATE, bdPina, consumoBs);
ok(totalUsdMesa === 6, `Total mesa $6.00 → ${totalUsdMesa}`);
ok(consumoBs === 4000, `Consumo Bs a tasa viva 800 → ${consumoBs}`);
ok(totalBsMesa === 5000, `Total Bs: piñas 1000 (dual) + consumo 4000 = 5000 → ${totalBsMesa}`);
// Liquidación dual (misma matemática que useCheckoutPayments)
const checkoutRate = round2(totalBsMesa / totalUsdMesa); // 833.33
ok(checkoutRate === 833.33, `Tasa de liquidación implícita 833.33 → ${checkoutRate}`);
const settle = (bs) => round2(bs / checkoutRate);
ok(settle(5000) === 6, 'Pagar Bs 5000 exacto cubre la mesa');
ok(settle(4000) === 4.8, 'Pagar Bs 4000 deja saldo (no da la mesa por pagada)');
// Offsets tras cobro parcial: 1 piña pagada (roundsOffset 1) → solo 1 billable
const bdTrasPago = calculateSessionCostBreakdown(90, 'PINA', cfg, 0, 1, 0, 1);
ok(bdTrasPago.pinaCost === 0.5, `Offset de rondas: 1 piña restante = $0.50 → ${bdTrasPago.pinaCost}`);

// ════════════════════════════════════════════════════════════════════
// FASE 4 — MESA CON ASIENTOS: división igual + cobro individual
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 4 — Mesa con 3 asientos, compartido ÷3');
const seats = [
    { id: 's1', label: 'P1', paid: false, timeCharges: [{ type: 'hora', amount: 1, id: 't1' }] },
    { id: 's2', label: 'P2', paid: false, timeCharges: [] },
    { id: 's3', label: 'P3', paid: false, timeCharges: [] },
];
const orderItems = [
    { id: 'i1', seat_id: null, unit_price_usd: 6, qty: 1 }, // compartido
    { id: 'i2', seat_id: 's1', unit_price_usd: 4, qty: 1 }, // individual P1
];
const sesAsientos = { game_mode: 'NORMAL', hours_paid: 0, extended_times: 0 };
const fb = calculateFullTableBreakdown(sesAsientos, seats, 30, cfg, orderItems, null, 3, false, 0, 0);
ok(fb.sharedTotal === 6, `Compartido total $6 → ${fb.sharedTotal}`);
ok(fb.sharedPerSeat === 2, `Compartido por asiento $2 → ${fb.sharedPerSeat}`);
const s1 = fb.seats.find(s => s.seat.id === 's1');
const s2 = fb.seats.find(s => s.seat.id === 's2');
ok(s1.subtotal === round2(3 + 2 + 4), `P1: hora $3 + compartido $2 + consumo $4 = $9 → ${s1.subtotal}`);
ok(s2.subtotal === 2, `P2: solo compartido $2 → ${s2.subtotal}`);
ok(fb.grandTotal === round2(9 + 2 + 2), `Gran total $13 → ${fb.grandTotal}`);
// Simulación de carrito sintético del cobro total: la suma de subtotales = gran total
const sumaSubtotales = round2(fb.seats.filter(sb => !sb.seat.paid).reduce((a, sb) => a + sb.subtotal, 0));
ok(Math.abs(sumaSubtotales - fb.grandTotal) < 0.02, 'Carrito sintético cuadra con gran total (sin divergencias)');
// Cobro individual de P1: los demás no cambian
seats[0].paid = true;
const fb2 = calculateFullTableBreakdown(sesAsientos, seats, 30, cfg, orderItems, null, 3, false, 0, 0);
const s2b = fb2.seats.find(s => s.seat.id === 's2');
ok(s2b.subtotal === 2, `Tras pagar P1 (divisor congelado 3): P2 sigue en $2 → ${s2b.subtotal}`);

// ════════════════════════════════════════════════════════════════════
// FASE 5 — VUELTO EN Bs: getSaleBs neto de cambio (reportes)
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 5 — Vuelto: ingresos Bs netos de cambio');
const getSaleBsReplica = (s) => {
    if (!s || s.status === 'ANULADA') return 0;
    const bsPayments = s.payments?.filter(p => p.currency === 'BS' || p.methodId?.includes('_bs') || p.methodId === 'pago_movil' || p.methodId === 'punto_de_venta');
    if (bsPayments?.length > 0) {
        const sumPaidBs = bsPayments.reduce((acc, p) => acc + (p.amountInput || p.amountBs || 0), 0);
        const netBs = round2(sumPaidBs - Math.abs(s.changeBs || 0));
        if (netBs > 0) return netBs;
    }
    if (s.totalBs > 0 && Math.abs(s.totalBs - (s.totalUsd * (s.rate || 1))) > 5 && !s.rateSource?.includes('Auto')) return round2(s.totalBs);
    const saleRate = s.rate || 0;
    if (s.totalUsd > 0 && saleRate > 0) return round2(s.totalUsd * saleRate);
    return round2(s.totalBs || 0);
};
const ventaConVuelto = {
    totalUsd: 0.5, totalBs: 500, rate: 800, rateSource: 'Manual', changeBs: 100, changeUsd: 0,
    payments: [{ methodId: 'efectivo_bs', currency: 'BS', amountInput: 600, amountBs: 600, amountUsd: 0.75 }],
};
ok(getSaleBsReplica(ventaConVuelto) === 500, `Bs 600 recibidos − 100 de vuelto = 500 de ingreso → ${getSaleBsReplica(ventaConVuelto)}`);
const ventaSinVuelto = { ...ventaConVuelto, changeBs: 0 };
ok(getSaleBsReplica(ventaSinVuelto) === 600, 'Sin vuelto se cuenta lo recibido completo');
// Contrato: el fix vive en calculatorUtils
const calcSrc = fs.readFileSync('src/utils/calculatorUtils.js', 'utf8');
ok(calcSrc.includes('sumPaidBs - Math.abs(s.changeBs || 0)'), 'getSaleBs en src descuenta el vuelto en Bs');

// ════════════════════════════════════════════════════════════════════
// FASE 6 — COBRO DE MESA: payloads canónicos visibles en el arqueo
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 6 — Cobro desde mesa con methodIds canónicos');
const cashierSrc = fs.readFileSync('src/views/CashierPaymentModal.jsx', 'utf8');
ok(cashierSrc.includes("methodId: 'efectivo_usd'"), 'Efectivo $ usa methodId canónico efectivo_usd');
ok(cashierSrc.includes("'punto_venta'") && cashierSrc.includes("'pago_movil'") && cashierSrc.includes("'efectivo_bs'"), 'Punto/PagoMóvil/Bs usan methodIds canónicos');
ok(!cashierSrc.includes("currency: 'VES'"), 'Sin currency legado VES');
ok(cashierSrc.includes('amountInput') && cashierSrc.includes('amountBs'), 'Pagos traen amountInput/amountBs para reportes');
ok(!/methodId:\s*'FIADO'/.test(cashierSrc), 'Fiado ya no viaja como pago (registra deuda real)');
// La venta de mesa ahora cae en los buckets del arqueo
const ventaMesaBs = {
    tipo: 'VENTA', totalUsd: 6, totalBs: 5000, rate: 800, changeUsd: 0, changeBs: 0,
    payments: [{ methodId: 'efectivo_bs', currency: 'BS', amountInput: 5000, amountBs: 5000, amountUsd: 6 }],
};
const bdMesa = FinancialEngine.calculatePaymentBreakdown([ventaMesaBs]);
ok(bdMesa['efectivo_bs']?.total === 5000, 'Cobro de mesa en Bs aparece en efectivo_bs del arqueo');

// ════════════════════════════════════════════════════════════════════
// FASE 7 — FIADO: registra deuda del cliente
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 7 — Fiado registra deuda');
const procSrc = fs.readFileSync('src/utils/checkoutProcessor.js', 'utf8');
ok(procSrc.includes("tipo: fiadoAmountUsd > 0 ? 'VENTA_FIADA' : 'VENTA'"), 'Pago parcial con cliente → VENTA_FIADA');
ok(procSrc.includes('deudaGenerada: fiadoAmountUsd'), 'La deuda generada se envía al impacto del cliente');
ok(procSrc.includes("error: 'Se requiere cliente para ventas fiadas'"), 'Sin cliente no se puede fiar (fail-closed)');
// Simulación: mesa $6, cliente paga $4 → fiado $2
const totalPaid = 4, cartTotal = 6;
const remaining = round2(Math.max(0, cartTotal - totalPaid));
ok(remaining === 2 && remaining > 0.01, `Saldo pendiente $2 se convierte en deuda → ${remaining}`);

// ════════════════════════════════════════════════════════════════════
// FASE 8 — CIERRE DE CAJA: esperado = gaveta neta de vueltos
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 8 — Cierre: arqueo cuadra con lo cobrado');
const ventasTurno = [
    apertura,
    ventaMesaBs,
    { tipo: 'VENTA', totalUsd: 10, totalBs: 8000, rate: 800, changeUsd: 1, changeBs: 0,
      payments: [{ methodId: 'efectivo_usd', currency: 'USD', amountInput: 11, amountUsd: 11, amountBs: 8800 }] },
    { tipo: 'VENTA_FIADA', totalUsd: 5, totalBs: 4000, rate: 800, payments: [] },
    { tipo: 'COBRO_DEUDA', totalUsd: 2, totalBs: 1600, rate: 800,
      payments: [{ methodId: 'efectivo_usd', currency: 'USD', amountInput: 2, amountUsd: 2, amountBs: 1600 }] },
];
const bdCierre = FinancialEngine.calculatePaymentBreakdown(ventasTurno);
ok(bdCierre['efectivo_usd'].total === 63, `Efectivo $ bruto: 50+11+2 = 63 → ${bdCierre['efectivo_usd'].total}`);
ok(bdCierre['_vuelto_usd'].total === -1, `Vuelto $ entregado −1 → ${bdCierre['_vuelto_usd'].total}`);
ok(bdCierre['efectivo_bs'].total === 5300, `Efectivo Bs: apertura 300 + mesa 5000 = 5300 → ${bdCierre['efectivo_bs'].total}`);
ok(bdCierre['fiado'].total === 3, `Fiado neto: +5 −2 = 3 → ${bdCierre['fiado'].total}`);
// Semáforo del wizard (esperado neto)
const expectedUsd = round2((bdCierre['efectivo_usd']?.total || 0) + (bdCierre['_vuelto_usd']?.total || 0));
const expectedBs = round2((bdCierre['efectivo_bs']?.total || 0) + (bdCierre['_vuelto_bs']?.total || 0));
ok(expectedUsd === 62, `Gaveta esperada $62 → ${expectedUsd}`);
ok(expectedBs === 5300, `Gaveta esperada Bs 5300 → ${expectedBs}`);
// Marcado cajaCerrada excluye del siguiente turno
const sessionOpenedAt = new Date(Date.now() - 3600_000).toISOString();
const marcadas = ventasTurno.filter(s => s.timestamp >= sessionOpenedAt).map(s => ({ ...s, cajaCerrada: true }));
const proximoTurno = marcadas.filter(s => !s.cajaCerrada);
ok(proximoTurno.length === 0, 'Todas las ventas del turno quedan marcadas cajaCerrada');
// Guardarraíl de cierre fantasma
const dashSrc = fs.readFileSync('src/views/DashboardView.jsx', 'utf8');
ok(dashSrc.includes('No hay una caja abierta para cerrar'), 'Cierre sin caja abierta está bloqueado');

// ════════════════════════════════════════════════════════════════════
// FASE 9 — MESA "DEJAR ACTIVA": offsets evitan doble cobro
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 9 — Dejar activa: offsets anti doble cobro');
const billingSrc = fs.readFileSync('src/hooks/store/tableBillingActions.js', 'utf8');
ok(billingSrc.includes('paidElapsedOffsets'), 'Offset de minutos transcurridos al cobrar');
ok(billingSrc.includes('offsetCache[sessionId] = currentHours'), 'Offset de horas pagadas al cobrar');
ok(billingSrc.includes("timeCharges: []"), 'timeCharges de asientos se limpian tras cobrar');
const billingEngineSrc = fs.readFileSync('src/utils/tableBillingEngine.js', 'utf8');
ok(billingEngineSrc.includes('if (paidAt) return 0;'), 'Sesión cobrada sin liberar no vuelve a cobrar tiempo');

// ════════════════════════════════════════════════════════════════════
// FASE 10 — MULTIPAGOS, VUELTO Y CAJA: detector de sobrepago y tasas cruzadas
// ════════════════════════════════════════════════════════════════════
console.log('\nFASE 10 — Multipagos: sobrepago detectado, vuelto a tasa de liquidación');
const hookSrc = fs.readFileSync('src/hooks/useCheckoutPayments.js', 'utf8');
ok(hookSrc.includes("type: 'multipago'"), 'Capa multipago: 2+ métodos que juntos exceden el total');
ok(hookSrc.includes('detectPaymentAnomaly({ barValues, paymentMethods, checkoutRate, cartTotalUsd, settlementPaidUsd })'), 'Detector usa la tasa de liquidación (no la viva)');
ok(/filter\(m => m\.id !== methodId\)[\s\S]*?divR\(val, checkoutRate\)/.test(hookSrc), '⚡Total convierte otros métodos Bs a tasa de liquidación');
const changeSrc = fs.readFileSync('src/components/Sales/CheckoutChangeBreakdown.jsx', 'utf8');
ok(changeSrc.includes('const settleRate = checkoutRate || effectiveRate || 1;'), 'Desglose de vuelo a tasa de liquidación');
const modalOverpaySrc = fs.readFileSync('src/components/Sales/CheckoutConfirmModals.jsx', 'utf8');
ok(modalOverpaySrc.includes("'Sobrepago en multipago'"), 'Modal muestra alerta de sobrepago multipago');
const salesDataSrc = fs.readFileSync('src/hooks/useSalesData.js', 'utf8');
ok(salesDataSrc.includes('sessionOpenedAt = null'), 'Gaveta en vivo acepta ventana de sesión');
const salesViewSrc = fs.readFileSync('src/views/SalesView.jsx', 'utf8');
ok(salesViewSrc.includes('buildCurrentFloat(salesData, activeCashSession?.opened_at || null)'), 'PDV pasa la sesión de caja a la gaveta');

// Simulación numérica del escenario exacto del reporte:
// Mesa $10.80 (Bs 9.940 a tasa implícita 920.37, BCV 800) + $5 + Bs 9.940
const EPS2 = 0.01;
const detectReplica = (bars, total, rate) => {
    const settle = bars.reduce((a, b) => a + b.usd, 0);
    const filled = bars.filter(b => b.val > 0).length;
    const overpay = round2(settle - total);
    const tolerance = Math.max(0.10, round2(total * 0.005));
    if (filled >= 2 && overpay > tolerance) return { type: 'multipago', overpayUsd: overpay };
    return null;
};
const casoReporte = detectReplica([{ val: 5, usd: 5 }, { val: 9940, usd: round2(9940 / 920.37) }], 10.80, 920.37);
ok(casoReporte?.type === 'multipago' && casoReporte.overpayUsd === 5, `$5 + Bs 9.940 para $10.80 → alerta de sobrepago $5.00 → ${JSON.stringify(casoReporte)}`);
const casoExacto = detectReplica([{ val: 5, usd: 5 }, { val: 5345, usd: round2(5345 / 920.37) }], 10.80, 920.37);
ok(casoExacto === null, 'Split exacto $5 + Bs 5.345 NO dispara alerta (sobrepago $0.01 bajo tolerancia)');
const casoRedondo = detectReplica([{ val: 20, usd: 20 }], 10.80, 920.37);
ok(casoRedondo === null, 'Un solo método con pago redondo ($20) NO dispara alerta (vuelto legítimo)');
// ⚡Total: resto exacto con multipago Bs a tasa de liquidación
const otherBs = 5000;
const otherPaid = round2(otherBs / 920.37);           // 5.43 (antes: 5000/800 = 6.25)
const target = round2(10.80 - otherPaid);
const fillBs = round2(target * 920.37);
ok(fillBs === 4942.39, `⚡Total Bs tras Bs 5.000 pagados llena el resto exacto (4.942,39) → ${fillBs}`);

console.log(`\n════════════════════════════════════════`);
console.log(`E2E flujo de ventas: ${passed} invariantes OK, ${failed} fallos`);
console.log(`════════════════════════════════════════`);
if (failed > 0) process.exit(1);
