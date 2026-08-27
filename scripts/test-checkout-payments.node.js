import { round2, mulR, divR, sumR } from '../src/utils/dinero.js';

const EPSILON = 0.01;

function detectPaymentAnomaly({ barValues, paymentMethods, effectiveRate, cartTotalUsd, totalPaidUsd }) {
    if (cartTotalUsd <= EPSILON) return null;

    for (const m of paymentMethods) {
        if (m.currency !== 'USD') continue;
        const val = parseFloat(barValues[m.id]) || 0;
        if (val <= 0 || effectiveRate <= 0) continue;
        const asUsdIfItWereBs = divR(val, effectiveRate);
        const pct = Math.abs(asUsdIfItWereBs - cartTotalUsd) / cartTotalUsd;
        if (pct <= 0.10) {
            return {
                type: 'currency',
                methodLabel: m.label,
                enteredAmount: val,
                expectedBs: round2(mulR(cartTotalUsd, effectiveRate)),
            };
        }
    }

    const ratio = round2(totalPaidUsd / cartTotalUsd);
    const diff  = round2(totalPaidUsd - cartTotalUsd);

    const overpay =
        (cartTotalUsd <= 10  && ratio > 4   && diff > 15)  ||
        (cartTotalUsd <= 50  && ratio > 3   && diff > 30)  ||
        (cartTotalUsd <= 200 && ratio > 2   && diff > 50)  ||
        (cartTotalUsd >  200 && ratio > 1.5 && diff > 100);
    if (overpay) return { type: 'overpay', ratio };

    if (ratio > 3) {
        for (const m of paymentMethods) {
            const val = parseFloat(barValues[m.id]) || 0;
            if (val > 0 && (val % 1000 === 0 || val % 500 === 0)) {
                return { type: 'round', enteredAmount: val, ratio };
            }
        }
    }

    return null;
}

function calculatePaymentsState({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, barValues }) {
    const totalPaidUsd = sumR(
        paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            if (val === 0) return 0;
            if (m.currency === 'USD') return round2(val);
            if (m.currency === 'COP') return tasaCop ? divR(val, tasaCop) : 0;
            return divR(val, effectiveRate);
        })
    );

    const proportionPaid = cartTotalUsd < EPSILON ? 1 : totalPaidUsd / cartTotalUsd;
    const isPaid = cartTotalUsd < EPSILON || proportionPaid >= (1 - EPSILON / Math.max(cartTotalUsd, EPSILON));

    return { totalPaidUsd, proportionPaid, isPaid };
}

function fillBarLogic({ methodId, currency, splitRemainingUsd = null, paymentMethods, barValues, cartTotalUsd, effectiveRate, tasaCop }) {
    const otherPaidUsd = sumR(
        paymentMethods
            .filter(m => m.id !== methodId)
            .map(m => {
                const val = parseFloat(barValues[m.id]) || 0;
                if (val === 0) return 0;
                if (m.currency === 'USD') return round2(val);
                if (m.currency === 'COP') return tasaCop ? divR(val, tasaCop) : 0;
                return divR(val, effectiveRate);
            })
    );

    const targetUsd = splitRemainingUsd != null
        ? splitRemainingUsd
        : Math.max(0, round2(cartTotalUsd - otherPaidUsd));

    let val;
    if (currency === 'USD') {
        val = targetUsd > 0 ? round2(targetUsd).toString() : null;
    } else if (currency === 'COP') {
        val = targetUsd > 0 && tasaCop ? mulR(targetUsd, tasaCop).toString() : null;
    } else {
        val = targetUsd > 0 ? round2(mulR(targetUsd, effectiveRate)).toString() : null;
    }
    return val;
}

// ── TEST HARNESS RUNNER ──
const paymentMethods = [
    { id: 'efectivo_usd', label: 'Efectivo USD', currency: 'USD' },
    { id: 'efectivo_bs', label: 'Efectivo Bs', currency: 'BS' },
    { id: 'pago_movil', label: 'Pago Móvil', currency: 'BS' },
    { id: 'punto_venta', label: 'Punto de Venta', currency: 'BS' },
];

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ [PASS] ${message}`);
        testsPassed++;
    } else {
        console.error(`❌ [FAIL] ${message}`);
        testsFailed++;
    }
}

console.log('=== RUNNING CHECKOUT PAYMENTS TEST HARNESS ===\n');

// T-1: Cobro 100% en Bs desde cero ($3.92 @ 800)
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const barValues = {};
    const filledVal = fillBarLogic({ methodId: 'efectivo_bs', currency: 'BS', paymentMethods, barValues, cartTotalUsd, effectiveRate, tasaCop: 0 });
    assert(filledVal === '3136', `T-1: fillBar rellenó ${filledVal} Bs (esperado: 3136)`);

    const state = calculatePaymentsState({ paymentMethods, effectiveRate, tasaCop: 0, cartTotalUsd, barValues: { efectivo_bs: filledVal } });
    assert(state.isPaid === true, `T-1: isPaid es ${state.isPaid} (esperado: true)`);
    assert(state.totalPaidUsd === 3.92, `T-1: totalPaidUsd es ${state.totalPaidUsd} (esperado: 3.92)`);
}

// T-2: Pago mixto — complemento en Pago Móvil
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const barValues = { efectivo_bs: '2784.44' }; // = $3.48 USD
    const filledVal = fillBarLogic({ methodId: 'pago_movil', currency: 'BS', paymentMethods, barValues, cartTotalUsd, effectiveRate, tasaCop: 0 });
    assert(filledVal === '352', `T-2: Pago Móvil rellenó ${filledVal} Bs (esperado: 352)`);

    const finalBarValues = { ...barValues, pago_movil: filledVal };
    const state = calculatePaymentsState({ paymentMethods, effectiveRate, tasaCop: 0, cartTotalUsd, barValues: finalBarValues });
    assert(state.isPaid === true, `T-2: Pago mixto isPaid es ${state.isPaid} (esperado: true)`);
}

// T-3: Idempotencia — re-clic sobre campo lleno
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const barValues = { efectivo_bs: '2784.44' };
    // Re-clic en el MISMO campo que ya tiene 2784.44
    const filledVal = fillBarLogic({ methodId: 'efectivo_bs', currency: 'BS', paymentMethods, barValues, cartTotalUsd, effectiveRate, tasaCop: 0 });
    assert(filledVal === '3136', `T-3: Re-clic en el mismo campo devolvió ${filledVal} Bs (esperado: 3136, NO 331.12)`);

    const state = calculatePaymentsState({ paymentMethods, effectiveRate, tasaCop: 0, cartTotalUsd, barValues: { efectivo_bs: filledVal } });
    assert(state.isPaid === true, `T-3: isPaid post re-clic es ${state.isPaid} (esperado: true)`);
}

// T-4: Cobro 100% en USD desde cero
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const barValues = {};
    const filledVal = fillBarLogic({ methodId: 'efectivo_usd', currency: 'USD', paymentMethods, barValues, cartTotalUsd, effectiveRate, tasaCop: 0 });
    assert(filledVal === '3.92', `T-4: USD rellenó ${filledVal} (esperado: 3.92)`);

    const state = calculatePaymentsState({ paymentMethods, effectiveRate, tasaCop: 0, cartTotalUsd, barValues: { efectivo_usd: filledVal } });
    assert(state.isPaid === true, `T-4: isPaid USD es ${state.isPaid} (esperado: true)`);
}

// T-5: Pago mixto USD + Total Bs
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const barValues = { efectivo_usd: '1.00' };
    const filledVal = fillBarLogic({ methodId: 'efectivo_bs', currency: 'BS', paymentMethods, barValues, cartTotalUsd, effectiveRate, tasaCop: 0 });
    assert(filledVal === '2336', `T-5: Restante Bs rellenó ${filledVal} Bs (esperado: 2336, que es 2.92 * 800)`);

    const state = calculatePaymentsState({ paymentMethods, effectiveRate, tasaCop: 0, cartTotalUsd, barValues: { ...barValues, efectivo_bs: filledVal } });
    assert(state.isPaid === true, `T-5: isPaid USD+Bs es ${state.isPaid} (esperado: true)`);
}

// T-6: Split 2 personas — cuota Bs a tasa
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const splitPeople = 2;
    const perPersonBs = divR(cartTotalUsd * effectiveRate, splitPeople);
    assert(perPersonBs === 1568, `T-6: Cuota Bs en split es ${perPersonBs} (esperado: 1568)`);
}

// T-7: detectPaymentAnomaly con cobro en Bs normal
{
    const cartTotalUsd = 3.92;
    const effectiveRate = 800;
    const barValues = { efectivo_bs: '3136' };
    const anomaly = detectPaymentAnomaly({ barValues, paymentMethods, effectiveRate, cartTotalUsd, totalPaidUsd: 3.92 });
    assert(anomaly === null, `T-7: detectPaymentAnomaly retornó ${JSON.stringify(anomaly)} (esperado: null)`);
}

console.log(`\n=== TEST HARNESS FINISHED: ${testsPassed} passed, ${testsFailed} failed ===`);
if (testsFailed > 0) process.exit(1);
