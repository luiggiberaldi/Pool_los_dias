import { useState, useCallback, useMemo, useRef } from 'react';
import { round2, mulR, divR, subR, sumR } from '../utils/dinero';

const EPSILON = 0.01;

/**
 * Detecta errores de pago en 4 capas (en orden de prioridad):
 *  1. Confusión Bs→USD: el cajero ingresó bolívares en el campo de dólares
 *  2. SOBREPAGO EN MULTIPAGO: 2+ métodos con monto que juntos exceden el total
 *     (casi siempre un campo llenado de más — ej: $5 + Bs 9.940 para un total de $10.80)
 *  3. Umbral proporcional por tamaño de venta
 *  4. Número redondo sospechoso (termina en 000 o 500 y supera 3× el total)
 *
 * Todas las comparaciones usan la TASA DE LIQUIDACIÓN (checkoutRate), que es la
 * misma con la que se evalúa isPaid — nunca la tasa viva, que distorsiona el
 * ratio cuando hay precios duales.
 *
 * Retorna null si no hay anomalía, o un objeto { type, ... } con los datos
 * necesarios para el mensaje de alerta.
 */
function detectPaymentAnomaly({ barValues, paymentMethods, checkoutRate, cartTotalUsd, settlementPaidUsd }) {
    if (cartTotalUsd <= EPSILON) return null;

    const rate = checkoutRate || 1;

    // ── Capa 1: confusión de moneda Bs → USD ─────────────────────────────────
    for (const m of paymentMethods) {
        if (m.currency !== 'USD') continue;
        const val = parseFloat(barValues[m.id]) || 0;
        if (val <= 0 || rate <= 0) continue;
        const asUsdIfItWereBs = divR(val, rate);
        const pct = Math.abs(asUsdIfItWereBs - cartTotalUsd) / cartTotalUsd;
        if (pct <= 0.10) {
            return {
                type: 'currency',
                methodLabel: m.label,
                enteredAmount: val,
                expectedBs: round2(mulR(cartTotalUsd, rate)),
            };
        }
    }

    // ── Capa 2: sobrepago combinando 2+ métodos ─────────────────────────────
    // Un solo método por encima del total = pago redondo legítimo (hay vuelto).
    // Dos o más métodos que JUNTOS exceden el total = casi siempre un campo de más.
    const filledMethods = paymentMethods.filter(m => (parseFloat(barValues[m.id]) || 0) > 0);
    const overpayUsd = round2(settlementPaidUsd - cartTotalUsd);
    const overTolerance = Math.max(0.10, round2(cartTotalUsd * 0.005));
    if (filledMethods.length >= 2 && overpayUsd > overTolerance) {
        return { type: 'multipago', overpayUsd, methodCount: filledMethods.length, ratio: round2(settlementPaidUsd / cartTotalUsd) };
    }

    const ratio = round2(settlementPaidUsd / cartTotalUsd);
    const diff  = round2(settlementPaidUsd - cartTotalUsd);

    // ── Capa 3: umbral proporcional por tamaño de venta (un solo método) ────
    const overpay =
        (cartTotalUsd <= 10  && ratio > 4   && diff > 15)  ||
        (cartTotalUsd <= 50  && ratio > 3   && diff > 30)  ||
        (cartTotalUsd <= 200 && ratio > 2   && diff > 50)  ||
        (cartTotalUsd >  200 && ratio > 1.5 && diff > 100);
    if (overpay) return { type: 'overpay', ratio };

    // ── Capa 4: número redondo sospechoso ────────────────────────────────────
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

export function useCheckoutPayments({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, cartTotalBs, onConfirmSale, triggerHaptic, splitMeta = null }) {
    const [barValues, setBarValues] = useState({});
    const [changeUsdGiven, setChangeUsdGiven] = useState('');
    const [changeBsGiven, setChangeBsGiven] = useState('');
    const [confirmFiar, setConfirmFiar] = useState(false);
    const [overpayAlertData, setOverpayAlertData] = useState(null); // null = sin alerta
    const submittingRef = useRef(false);

    const totalPaidUsd = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            if (val === 0) return 0;
            if (m.currency === 'USD') return round2(val);
            if (m.currency === 'COP') return tasaCop ? divR(val, tasaCop) : 0;
            return divR(val, effectiveRate);
        });
        return sumR(amounts);
    }, [barValues, paymentMethods, effectiveRate, tasaCop]);

    const totalPaidBs = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            if (val === 0) return 0;
            if (m.currency === 'BS') return round2(val);
            if (m.currency === 'COP') return tasaCop ? mulR(divR(val, tasaCop), effectiveRate) : 0;
            return mulR(val, effectiveRate);
        });
        return sumR(amounts);
    }, [barValues, paymentMethods, effectiveRate, tasaCop]);

    // ── Tasa de liquidación (precio dual $ / Bs) ─────────────────────────────
    // Si el carrito trae precios Bs independientes (cartTotalBs ≠ USD × tasa),
    // la venta se liquida a la tasa implícita cartTotalBs / cartTotalUsd para que
    // pagar el precio Bs fijado (ej: La Piña Bs 500) cubra exactamente el total,
    // igual que pagarlo en $ (ej: $0.50). Sin precios duales, checkoutRate es la
    // tasa viva y el comportamiento es idéntico al histórico.
    const checkoutRate = (cartTotalUsd > EPSILON && cartTotalBs > EPSILON)
        ? divR(cartTotalBs, cartTotalUsd)
        : effectiveRate;

    // Liquidación: los pagos en Bs se evalúan a checkoutRate (precio dual).
    const settlementPaidUsd = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            if (val === 0) return 0;
            if (m.currency === 'USD') return round2(val);
            if (m.currency === 'COP') return tasaCop ? divR(val, tasaCop) : 0;
            return divR(val, checkoutRate);
        });
        return sumR(amounts);
    }, [barValues, paymentMethods, checkoutRate, tasaCop]);

    const proportionPaid = useMemo(() => {
        if (cartTotalUsd < EPSILON) return 1;
        return settlementPaidUsd / cartTotalUsd;
    }, [settlementPaidUsd, cartTotalUsd]);

    const overProportion = Math.max(0, proportionPaid - 1);
    const remainProportion = Math.max(0, 1 - proportionPaid);
    const remainingUsd = round2(remainProportion * cartTotalUsd);
    const effectiveTotalBs = round2(mulR(cartTotalUsd, checkoutRate));
    const remainingBs = round2(remainProportion * effectiveTotalBs);
    const changeUsd = round2(overProportion * cartTotalUsd);
    const changeBs = round2(overProportion * effectiveTotalBs);
    const isPaid = cartTotalUsd < EPSILON || proportionPaid >= (1 - EPSILON / Math.max(cartTotalUsd, EPSILON));

    // Ref to always have the latest remaining values available for fillBar,
    // avoiding stale closures when user types in one method then clicks Total on another.
    const remainingRef = useRef({ usd: remainingUsd, bs: remainingBs });
    remainingRef.current = { usd: remainingUsd, bs: remainingBs };

    const handleBarChange = useCallback((methodId, value) => {
        let v = value.replace(',', '.');
        if (!/^[0-9.]*$/.test(v)) return;
        const dots = v.match(/\./g);
        if (dots && dots.length > 1) return;
        setBarValues(prev => ({ ...prev, [methodId]: v }));
    }, []);

    const fillBar = useCallback((methodId, currency, splitRemainingUsd = null) => {
        triggerHaptic && triggerHaptic();

        // Target isolation: calculate settlement-USD paid by OTHER methods (excluding target methodId).
        // Usa la MISMA conversión que la liquidación (checkoutRate para Bs) para que el
        // botón ⚡ Total llene el resto EXACTO cuando hay precio dual y multipago Bs.
        const otherPaidUsd = sumR(
            paymentMethods
                .filter(m => m.id !== methodId)
                .map(m => {
                    const val = parseFloat(barValues[m.id]) || 0;
                    if (val === 0) return 0;
                    if (m.currency === 'USD') return round2(val);
                    if (m.currency === 'COP') return tasaCop ? divR(val, tasaCop) : 0;
                    return divR(val, checkoutRate);
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
            // Precio dual: llena el resto en Bs según la tasa de liquidación
            val = targetUsd > 0 ? round2(mulR(targetUsd, checkoutRate)).toString() : null;
        }
        if (val) setBarValues(prev => ({ ...prev, [methodId]: val }));
    }, [effectiveRate, checkoutRate, triggerHaptic, tasaCop, paymentMethods, barValues, cartTotalUsd]);

    const _doConfirm = useCallback(async () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        try {
            triggerHaptic && triggerHaptic();
            const payments = paymentMethods
                .filter(m => parseFloat(barValues[m.id]) > 0)
                .map(m => {
                    const amount = round2(parseFloat(barValues[m.id]));
                    const amountUsd = m.currency === 'USD' ? amount : m.currency === 'COP' ? (tasaCop ? divR(amount, tasaCop) : 0) : divR(amount, effectiveRate);
                    console.log(`[PaymentConvert] ${m.label}: ${amount} ${m.currency} → $${amountUsd} USD (effectiveRate=${effectiveRate})`);
                    return {
                        id: crypto.randomUUID(),
                        methodId: m.id,
                        methodLabel: m.label,
                        currency: m.currency,
                        amountInput: amount,
                        amountInputCurrency: m.currency,
                        amountUsd,
                        amountBs: m.currency === 'BS' ? amount : m.currency === 'COP' ? (tasaCop ? mulR(divR(amount, tasaCop), effectiveRate) : 0) : mulR(amount, effectiveRate),
                    };
                });
            // Detect which currencies were actually used for payment
            const hasUsdPayment = payments.some(p => p.currency === 'USD');
            const hasBsPayment = payments.some(p => p.currency === 'BS');
            const onlyBs = hasBsPayment && !hasUsdPayment;

            let defaultUsdChange, defaultBsChange;
            if (!changeUsdGiven && !changeBsGiven) {
                // No manual split — default change to the currency that was used
                defaultUsdChange = onlyBs ? 0 : changeUsd;
                defaultBsChange = onlyBs ? changeBs : 0;
            } else {
                defaultUsdChange = round2(parseFloat(changeUsdGiven) || 0);
                defaultBsChange = round2(parseFloat(changeBsGiven) || 0);
            }
            await onConfirmSale(payments, {
                changeUsdGiven: round2(Math.min(defaultUsdChange, changeUsd)),
                changeBsGiven: round2(Math.min(defaultBsChange, changeBs)),
            }, splitMeta);
        } finally {
            submittingRef.current = false;
        }
    }, [barValues, paymentMethods, effectiveRate, tasaCop, onConfirmSale, triggerHaptic, changeUsdGiven, changeBsGiven, changeUsd, changeBs, splitMeta]);

    const handleConfirm = useCallback(async () => {
        const anomaly = detectPaymentAnomaly({ barValues, paymentMethods, checkoutRate, cartTotalUsd, settlementPaidUsd });
        if (anomaly) {
            setOverpayAlertData(anomaly);
            return;
        }
        await _doConfirm();
    }, [barValues, paymentMethods, checkoutRate, cartTotalUsd, settlementPaidUsd, _doConfirm]);

    const confirmOverpay = useCallback(async () => {
        setOverpayAlertData(null);
        await _doConfirm();
    }, [_doConfirm]);

    return {
        barValues, totalPaidUsd, totalPaidBs, checkoutRate,
        remainingUsd, remainingBs, changeUsd, changeBs,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        changeBsGiven, setChangeBsGiven,
        confirmFiar, setConfirmFiar,
        overpayAlertData, setOverpayAlertData, confirmOverpay,
    };
}

export { EPSILON };
