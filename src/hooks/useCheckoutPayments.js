import { useState, useCallback, useMemo, useRef } from 'react';
import { round2, mulR, divR, subR, sumR } from '../utils/dinero';

const EPSILON = 0.01;

export function useCheckoutPayments({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, cartTotalBs, onConfirmSale, triggerHaptic }) {
    const [barValues, setBarValues] = useState({});
    const [changeUsdGiven, setChangeUsdGiven] = useState('');
    const [changeBsGiven, setChangeBsGiven] = useState('');
    const [confirmFiar, setConfirmFiar] = useState(false);
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

    const fillBar = useCallback((methodId, currency) => {
        triggerHaptic && triggerHaptic();
        let val;
        if (currency === 'USD') {
            val = remainingUsd > 0 ? round2(remainingUsd).toString() : null;
        } else if (currency === 'COP') {
            val = remainingUsd > 0 && tasaCop ? mulR(remainingUsd, tasaCop).toString() : null;
        } else {
            val = remainingBs > 0 ? round2(remainingBs).toString() : null;
        }
        if (val) setBarValues(prev => ({ ...prev, [methodId]: val }));
    }, [remainingUsd, remainingBs, triggerHaptic, tasaCop]);

    const handleConfirm = useCallback(async () => {
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
            const defaultUsdChange = (!changeUsdGiven && !changeBsGiven) ? changeUsd : round2(parseFloat(changeUsdGiven) || 0);
            const defaultBsChange = (!changeUsdGiven && !changeBsGiven) ? 0 : round2(parseFloat(changeBsGiven) || 0);
            await onConfirmSale(payments, {
                changeUsdGiven: round2(Math.min(defaultUsdChange, changeUsd)),
                changeBsGiven: round2(Math.min(defaultBsChange, mulR(changeUsd, effectiveRate))),
            });
        } finally {
            submittingRef.current = false;
        }
    }, [barValues, paymentMethods, effectiveRate, tasaCop, onConfirmSale, triggerHaptic, changeUsdGiven, changeBsGiven, changeUsd]);

    return {
        barValues, totalPaidUsd, totalPaidBs,
        remainingUsd, remainingBs, changeUsd, changeBs,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        changeBsGiven, setChangeBsGiven,
        confirmFiar, setConfirmFiar,
    };
}

export { EPSILON };
