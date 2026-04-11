import { useState, useCallback, useMemo, useRef } from 'react';
import { round2, mulR, divR, subR, sumR } from '../utils/dinero';

const EPSILON = 0.01;

/**
 * Detecta errores de pago en 3 capas (en orden de prioridad):
 *  1. Confusión Bs→USD: el cajero ingresó bolívares en el campo de dólares
 *  2. Umbral proporcional por tamaño de venta
 *  3. Número redondo sospechoso (termina en 000 o 500 y supera 3× el total)
 *
 * Retorna null si no hay anomalía, o un objeto { type, ... } con los datos
 * necesarios para el mensaje de alerta.
 */
function detectPaymentAnomaly({ barValues, paymentMethods, effectiveRate, cartTotalUsd, totalPaidUsd }) {
    if (cartTotalUsd <= EPSILON) return null;

    // ── Capa 1: confusión de moneda Bs → USD ─────────────────────────────────
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

    // ── Capa 2: umbral proporcional por tamaño de venta ──────────────────────
    const overpay =
        (cartTotalUsd <= 10  && ratio > 4   && diff > 15)  ||
        (cartTotalUsd <= 50  && ratio > 3   && diff > 30)  ||
        (cartTotalUsd <= 200 && ratio > 2   && diff > 50)  ||
        (cartTotalUsd >  200 && ratio > 1.5 && diff > 100);
    if (overpay) return { type: 'overpay', ratio };

    // ── Capa 3: número redondo sospechoso ────────────────────────────────────
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

    const remainingUsd = round2(Math.max(0, subR(cartTotalUsd, totalPaidUsd)));
    const remainingBs = round2(Math.max(0, subR(cartTotalBs, totalPaidBs)));
    const changeUsd = round2(Math.max(0, subR(totalPaidUsd, cartTotalUsd)));
    const changeBs = round2(Math.max(0, subR(totalPaidBs, cartTotalBs)));
    const isPaid = remainingUsd < EPSILON;

    const handleBarChange = useCallback((methodId, value) => {
        let v = value.replace(',', '.');
        if (!/^[0-9.]*$/.test(v)) return;
        const dots = v.match(/\./g);
        if (dots && dots.length > 1) return;
        setBarValues(prev => ({ ...prev, [methodId]: v }));
    }, []);

    const fillBar = useCallback((methodId, currency, splitRemainingUsd = null) => {
        triggerHaptic && triggerHaptic();
        const targetUsd = splitRemainingUsd != null ? splitRemainingUsd : remainingUsd;
        const targetBs = splitRemainingUsd != null ? mulR(splitRemainingUsd, effectiveRate) : remainingBs;
        let val;
        if (currency === 'USD') {
            val = targetUsd > 0 ? round2(targetUsd).toString() : null;
        } else if (currency === 'COP') {
            val = targetUsd > 0 && tasaCop ? mulR(targetUsd, tasaCop).toString() : null;
        } else {
            val = targetBs > 0 ? round2(targetBs).toString() : null;
        }
        if (val) setBarValues(prev => ({ ...prev, [methodId]: val }));
    }, [remainingUsd, remainingBs, effectiveRate, triggerHaptic, tasaCop]);

    const _doConfirm = useCallback(async () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        try {
            triggerHaptic && triggerHaptic();
            const payments = paymentMethods
                .filter(m => parseFloat(barValues[m.id]) > 0)
                .map(m => {
                    const amount = round2(parseFloat(barValues[m.id]));
                    return {
                        id: crypto.randomUUID(),
                        methodId: m.id,
                        methodLabel: m.label,
                        currency: m.currency,
                        amountInput: amount,
                        amountInputCurrency: m.currency,
                        amountUsd: m.currency === 'USD' ? amount : m.currency === 'COP' ? (tasaCop ? divR(amount, tasaCop) : 0) : divR(amount, effectiveRate),
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
                changeBsGiven: round2(Math.min(defaultBsChange, mulR(changeUsd, effectiveRate))),
            }, splitMeta);
        } finally {
            submittingRef.current = false;
        }
    }, [barValues, paymentMethods, effectiveRate, tasaCop, onConfirmSale, triggerHaptic, changeUsdGiven, changeBsGiven, changeUsd, splitMeta]);

    const handleConfirm = useCallback(async () => {
        const anomaly = detectPaymentAnomaly({ barValues, paymentMethods, effectiveRate, cartTotalUsd, totalPaidUsd });
        if (anomaly) {
            setOverpayAlertData(anomaly);
            return;
        }
        await _doConfirm();
    }, [barValues, paymentMethods, effectiveRate, cartTotalUsd, totalPaidUsd, _doConfirm]);

    const confirmOverpay = useCallback(async () => {
        setOverpayAlertData(null);
        await _doConfirm();
    }, [_doConfirm]);

    return {
        barValues, totalPaidUsd, totalPaidBs,
        remainingUsd, remainingBs, changeUsd, changeBs,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        changeBsGiven, setChangeBsGiven,
        confirmFiar, setConfirmFiar,
        overpayAlertData, setOverpayAlertData, confirmOverpay,
    };
}

export { EPSILON };
