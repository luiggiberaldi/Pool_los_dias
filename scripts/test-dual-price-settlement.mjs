import fs from 'node:fs';

// ── Contratos de código: la liquidación dual debe existir en las 3 superficies ──
const hookSrc = fs.readFileSync('src/hooks/useCheckoutPayments.js', 'utf8');
const modalSrc = fs.readFileSync('src/components/Sales/CheckoutModal.jsx', 'utf8');
const cashierSrc = fs.readFileSync('src/views/CashierPaymentModal.jsx', 'utf8');

const invariants = [
  [hookSrc, 'const checkoutRate = (cartTotalUsd > EPSILON && cartTotalBs > EPSILON)', 'checkoutRate deriva de cartTotalBs/cartTotalUsd'],
  [hookSrc, 'return divR(val, checkoutRate);', 'pagos en Bs se liquidan a la tasa de liquidación'],
  [hookSrc, 'const effectiveTotalBs = round2(mulR(cartTotalUsd, checkoutRate));', 'resto/vuelto Bs usan la tasa de liquidación'],
  [hookSrc, 'round2(mulR(targetUsd, checkoutRate))', 'botón ⚡ Total en Bs llena según la tasa de liquidación'],
  [hookSrc, 'barValues, totalPaidUsd, totalPaidBs, checkoutRate,', 'hook exporta checkoutRate'],
  [hookSrc, ': divR(amount, effectiveRate);', 'registro contable de pagos Bs queda a tasa viva'],
  [modalSrc, '(parseFloat(val) / checkoutRate).toFixed(2)', 'pista ≈ $ del input Bs usa la tasa de liquidación'],
  [modalSrc, 'Liquida:', 'modal muestra la tasa de liquidación cuando difiere de la viva'],
  [cashierSrc, '? divR(grandTotalBs, grandTotal) : rates', 'cobro desde mesa liquida al precio Bs fijado'],
  [cashierSrc, 'amountUsd: round2(divR(rBs, rates))', 'registro contable del cobro en Bs queda a tasa viva'],
];
for (const [src, marker, label] of invariants) {
  if (!src.includes(marker)) throw new Error(`Falta contrato: ${label} (marcador: ${marker})`);
}

// ── Simulación numérica independiente (escenario exacto de las capturas) ──
// La Piña: $0.50 / Bs 500 fijos, tasa viva 800 Bs/$
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPSILON = 0.01;
function simulate(cartTotalUsd, cartTotalBs, effectiveRate) {
  const checkoutRate = (cartTotalUsd > EPSILON && cartTotalBs > EPSILON)
    ? round2(cartTotalBs / cartTotalUsd)
    : effectiveRate;
  const settle = (usd, bs) => round2(usd + bs / checkoutRate);
  const isPaid = (paid) => paid / cartTotalUsd >= (1 - EPSILON / Math.max(cartTotalUsd, EPSILON));
  const totalBs = round2(cartTotalUsd * checkoutRate);
  const remainBs = (paid) => round2(Math.max(0, 1 - paid / cartTotalUsd) * totalBs);
  const changeBs = (paid) => round2(Math.max(0, paid / cartTotalUsd - 1) * totalBs);
  return { checkoutRate, settle, isPaid, remainBs, changeBs, totalBs };
}

// 1. Escenario dual real: Bs 400 (tasa viva) ya NO cubre el total; restan Bs 100 / $0.10
let s = simulate(0.5, 500, 800);
let paid = s.settle(0, 400);
if (!(Math.abs(paid - 0.4) < 1e-9 && !s.isPaid(paid) && Math.abs(s.remainBs(paid) - 100) < 1e-9)) {
  throw new Error('Dual: Bs 400 no debe cubrir La Piña de Bs 500');
}

// 2. Bs 500 (precio fijado) cubre exacto y sin vuelto
paid = s.settle(0, 500);
if (!(s.isPaid(paid) && Math.abs(s.changeBs(paid)) < 1e-9)) {
  throw new Error('Dual: Bs 500 debe cubrir exacto sin vuelto');
}

// 3. $0.50 cubre exacto
paid = s.settle(0.5, 0);
if (!(s.isPaid(paid) && Math.abs(s.changeBs(paid)) < 1e-9)) {
  throw new Error('Dual: $0.50 debe cubrir exacto sin vuelto');
}

// 4. Mixto $0.25 + Bs 250 (tasa implícita 1.000) cubre exacto
paid = s.settle(0.25, 250);
if (!(s.isPaid(paid) && Math.abs(s.changeBs(paid)) < 1e-9)) {
  throw new Error('Dual: pago mixto $0.25 + Bs 250 debe cubrir exacto');
}

// 5. Carrito sin precio dual (Bs total = USD × tasa): comportamiento histórico intacto
s = simulate(0.5, round2(0.5 * 800), 800);
paid = s.settle(0, 400);
if (!(s.checkoutRate === 800 && s.isPaid(paid) && Math.abs(s.totalBs - 400) < 1e-9)) {
  throw new Error('Histórico: sin precio dual, Bs 400 = USD × tasa debe cubrir');
}

// 6. Sobrepago dual: pagar Bs 600 genera vuelto proporcional (Bs 100)
s = simulate(0.5, 500, 800);
paid = s.settle(0, 600);
if (!(s.isPaid(paid) && Math.abs(s.changeBs(paid) - 100) < 1e-9)) {
  throw new Error('Dual: Bs 600 debe devolver Bs 100 de vuelto');
}

console.log('PASS: 10 invariantes de código + 6 escenarios numéricos de liquidación dual verificados');
