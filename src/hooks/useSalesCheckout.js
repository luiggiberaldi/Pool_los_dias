import { useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { round2, divR, sumR } from '../utils/dinero';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useAuthStore } from './store/authStore';
import { calculateGrandTotalBs, calculateSessionCostBreakdown, formatHoursPaid, calculateSeatCostBreakdown, calculateFullTableBreakdown, calculateBreakdownTotalBs, calculateSeatTimeCostBs, calculateConsumptionBs } from '../utils/tableBillingEngine';

const EPSILON = 0.01;

export function useSalesCheckout({
    cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd,
    effectiveRate, tasaCop, copEnabled, discountData, useAutoRate,
    customers, setCustomers, products,
    setProductsAfterCheckout, setSalesData,
    setCart, setShowCheckout, setShowReceipt, setSelectedCustomerId, setCartSelectedIndex,
    setShowConfetti, tableCheckoutData, setTableCheckoutData,
    playCheckout, playError, triggerHaptic, notifyLowStock,
}) {
    const handleCheckout = useCallback(async (payments, changeBreakdown) => {
        triggerHaptic && triggerHaptic();
        const opts = {
            cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd, payments, changeBreakdown,
            selectedCustomerId: '', customers, products, effectiveRate, tasaCop, copEnabled,
            discountData, useAutoRate
        };
        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return;
        }
        setProductsAfterCheckout(result.updatedProducts);
        if (result.updatedCustomers) setCustomers(result.updatedCustomers);
        setSalesData(prev => [result.sale, ...prev]);
        setShowReceipt(result.sale);
        playCheckout();
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setCart([]);
        setShowCheckout(false);
        setSelectedCustomerId('');
        setCartSelectedIndex(-1);
    }, [cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd, effectiveRate, tasaCop, copEnabled, discountData, useAutoRate, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, playCheckout, setShowConfetti, notifyLowStock, setCart, setShowCheckout, setSelectedCustomerId, setCartSelectedIndex, playError, triggerHaptic]);

    // Accepts selectedCustomerId as argument since it's owned by the view
    const handleCheckoutWithCustomer = useCallback(async (payments, changeBreakdown, selectedCustomerId, splitMeta = null) => {
        triggerHaptic && triggerHaptic();
        const opts = {
            cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd, payments, changeBreakdown,
            selectedCustomerId, customers, products, effectiveRate, tasaCop, copEnabled,
            discountData, useAutoRate, splitMeta
        };
        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return;
        }
        setProductsAfterCheckout(result.updatedProducts);
        if (result.updatedCustomers) setCustomers(result.updatedCustomers);
        setSalesData(prev => [result.sale, ...prev]);
        setShowReceipt(result.sale);
        playCheckout();
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setCart([]);
        setShowCheckout(false);
        setSelectedCustomerId('');
        setCartSelectedIndex(-1);
    }, [cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd, effectiveRate, tasaCop, copEnabled, discountData, useAutoRate, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, playCheckout, setShowConfetti, notifyLowStock, setCart, setShowCheckout, setSelectedCustomerId, setCartSelectedIndex, playError, triggerHaptic]);

    const handleTableCheckout = useCallback(async (payments, changeBreakdown, selectedCustomerId, shouldRelease = null, splitMeta = null) => {
        if (!tableCheckoutData) return;
        triggerHaptic && triggerHaptic();

        const seatId = tableCheckoutData.seatId || null;
        // Use fresh session from store (snapshot session may be stale after adding time/piñas)
        const snapshotSession = tableCheckoutData.session;
        const freshSession = useTablesStore.getState().activeSessions.find(s => s.id === snapshotSession?.id);
        const session = freshSession || snapshotSession;
        const seats = session?.seats || [];
        const config = useTablesStore.getState().config;
        const paidHoursOffsets = useTablesStore.getState().paidHoursOffsets || {};
        const paidRoundsOffsets = useTablesStore.getState().paidRoundsOffsets || {};
        const hoursOff = paidHoursOffsets[session?.id] || 0;
        const roundsOff = paidRoundsOffsets[session?.id] || 0;

        const syntheticCart = [];

        if (seatId && seats.length > 0) {
            // ═══ PER-SEAT CHECKOUT ═══
            const seat = seats.find(s => s.id === seatId);
            if (!seat) { showToast('Asiento no encontrado', 'error'); return; }

            const seatTimeCost = calculateSeatCostBreakdown(seat, tableCheckoutData.elapsed, config);
            const tableName = `${tableCheckoutData.table?.name || 'Mesa'} (${seat.label || 'Persona'})`;

            // Time cost for this seat (soporta timeCharges nuevo estilo y legacy)
            if (seatTimeCost.pinaCost > 0) {
                const pinaQty = seat.timeCharges
                    ? seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + (tc.amount || 1), 0)
                    : (seat.pinas || 1);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Piña ${tableName}`,
                    priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                    qty: pinaQty, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (seatTimeCost.hourCost > 0) {
                const horasQty = seat.timeCharges
                    ? seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + (tc.amount || 0), 0)
                    : (seat.hoursPaid || 0);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo ${tableName} (${formatHoursPaid(horasQty)})`,
                    priceUsdt: round2(seatTimeCost.hourCost), priceUsd: round2(seatTimeCost.hourCost),
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }

            // Seat-specific items
            const seatItems = (tableCheckoutData.currentItems || []).filter(i => i.seat_id === seatId);
            seatItems.forEach(item => {
                const p = products.find(p => p.id === item.product_id);
                const _exactBs = p?.isCombo && p?.priceBs > 0 ? p.priceBs : null;
                syntheticCart.push(p
                    ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: p.costBs || 0, costUsd: p.costUsd || 0, exactBs: _exactBs }
                    : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                );
            });

            // Shared portion
            const frozenDivisor = tableCheckoutData.frozenDivisor || null;
            const isTimeFree = tableCheckoutData.table?.type === 'NORMAL';
            const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, frozenDivisor, isTimeFree, hoursOff, roundsOff);
            if (fullBreakdown) {
                const seatBd = fullBreakdown.seats.find(s => s.seat.id === seatId);
                if (seatBd && seatBd.sharedPortion > 0) {
                    syntheticCart.push({
                        id: crypto.randomUUID(),
                        name: `Compartido ${tableCheckoutData.table?.name || 'Mesa'} (÷${fullBreakdown.seats.filter(s => !s.seat.paid).length})`,
                        priceUsdt: round2(seatBd.sharedPortion), priceUsd: round2(seatBd.sharedPortion),
                        qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                    });
                }
            }
        } else if (!seatId && seats.length > 0) {
            // ═══ COBRAR TODO CON CUANTAS DIVIDIDAS ═══
            const frozenDivisor = tableCheckoutData.frozenDivisor || null;
            const isTimeFreeAll = tableCheckoutData.table?.type === 'NORMAL';
            const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, frozenDivisor, isTimeFreeAll, hoursOff, roundsOff);
            if (fullBreakdown) {
                const unpaidSeatBds = fullBreakdown.seats.filter(sb => !sb.seat.paid);
                const divisorLabel = unpaidSeatBds.length;
                unpaidSeatBds.forEach(seatBd => {
                    const seat = seatBd.seat;
                    const seatLabel = `${tableCheckoutData.table?.name || 'Mesa'} (${seat.label || 'Persona'})`;
                    if (seatBd.timeCost.pinaCost > 0) {
                        const pinaQty = seat.timeCharges
                            ? seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + (tc.amount || 1), 0)
                            : (seat.pinas || 1);
                        syntheticCart.push({ id: crypto.randomUUID(), name: `Piña ${seatLabel}`, priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0), qty: pinaQty, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999 });
                    }
                    if (seatBd.timeCost.hourCost > 0) {
                        const horasQty = seat.timeCharges
                            ? seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + (tc.amount || 0), 0)
                            : (seat.hoursPaid || 0);
                        syntheticCart.push({ id: crypto.randomUUID(), name: `Tiempo ${seatLabel} (${formatHoursPaid(horasQty)})`, priceUsdt: round2(seatBd.timeCost.hourCost), priceUsd: round2(seatBd.timeCost.hourCost), qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999 });
                    }
                    seatBd.items.forEach(item => {
                        const p = products.find(p => p.id === item.product_id);
                        const _exactBs = p?.isCombo && p?.priceBs > 0 ? p.priceBs : null;
                        syntheticCart.push(p
                            ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: p.costBs || 0, costUsd: p.costUsd || 0, exactBs: _exactBs }
                            : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                        );
                    });
                    if (seatBd.sharedPortion > 0) {
                        syntheticCart.push({ id: crypto.randomUUID(), name: `Compartido ${tableCheckoutData.table?.name || 'Mesa'} (÷${divisorLabel})`, priceUsdt: round2(seatBd.sharedPortion), priceUsd: round2(seatBd.sharedPortion), qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999 });
                    }
                });
            }
        } else {
            // ═══ CLASSIC (FULL TABLE) CHECKOUT ═══
            // Always recalculate with current offsets (snapshot timeCost may be stale)
            const breakdown = calculateSessionCostBreakdown(tableCheckoutData.elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, hoursOff, roundsOff);

            if (breakdown.pinaCost > 0) {
                const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                const billableRounds = Math.max(0, pinaCount - roundsOff);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Piña ${tableCheckoutData.table.name}`,
                    priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                    qty: billableRounds, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (breakdown.hourCost > 0) {
                const billableHours = Math.max(0, (Number(session.hours_paid) || 0) - hoursOff);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo ${tableCheckoutData.table.name} (${formatHoursPaid(billableHours)})`,
                    priceUsdt: round2(breakdown.hourCost), priceUsd: round2(breakdown.hourCost),
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (tableCheckoutData.currentItems?.length > 0) {
                tableCheckoutData.currentItems.forEach(item => {
                    const p = products.find(p => p.id === item.product_id);
                    const _exactBs = p?.isCombo && p?.priceBs > 0 ? p.priceBs : null;
                    if (p) {
                        syntheticCart.push({ ...p, id: p.id, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: p.costBs || 0, costUsd: p.costUsd || 0, exactBs: _exactBs });
                    } else {
                        syntheticCart.push({
                            id: item.product_id, _originalId: item.product_id,
                            name: item.product_name || 'Producto (sin catálogo)',
                            priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd),
                            qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999
                        });
                    }
                });
            }
        }

        // Recalculate totals from actual cart items (defense against stale snapshot)
        const recalcCartTotal = round2(syntheticCart.reduce((sum, item) => sum + round2((item.priceUsd || 0) * (item.qty || 1)), 0));
        const discountAmt = tableCheckoutData.discountData?.active ? round2(tableCheckoutData.discountData.amountUsd || 0) : 0;
        let effectiveCartTotal = round2(Math.max(0, recalcCartTotal - discountAmt));

        // Guard: the total shown in CheckoutModal (tableCheckoutData.grandTotal) and the
        // recalculated total from the synthetic cart can diverge due to rounding across
        // different calculation paths (TableQueuePanel sums raw floats, synthetic cart
        // rounds each item).  The user paid exactly what was shown, so if their payment
        // covers the shown total we must honor it — never trigger a false fiado.
        const _totalPaidCheck = sumR(payments.map(p => p.amountUsd));
        const _shownTotal = round2(tableCheckoutData.grandTotal || 0);
        console.log('[TableCheckout] effectiveCartTotal:', effectiveCartTotal, 'recalcCartTotal:', recalcCartTotal, '_totalPaidCheck:', _totalPaidCheck, '_shownTotal:', _shownTotal);
        console.log('[TableCheckout] payments:', JSON.stringify(payments.map(p => ({ method: p.methodLabel, currency: p.currency, input: p.amountInput, usd: p.amountUsd, bs: p.amountBs }))));
        console.log('[TableCheckout] effectiveRate (BCV):', effectiveRate, 'discountAmt:', discountAmt);
        if (effectiveCartTotal > _totalPaidCheck && _totalPaidCheck >= _shownTotal - EPSILON) {
            // User paid what was shown — snap to paid amount
            effectiveCartTotal = round2(_totalPaidCheck);
        }
        // Also guard small divergences from Bs→USD conversion rounding:
        // if the user paid within $0.05 of the cart, honor it to avoid false fiado
        if (effectiveCartTotal > _totalPaidCheck && Math.abs(effectiveCartTotal - _totalPaidCheck) <= 0.05) {
            effectiveCartTotal = round2(_totalPaidCheck);
        }
        // Guard: rate mismatch between display Bs (implicit config rate) and payment
        // Bs→USD conversion (BCV rate). If user paid enough Bs to cover the displayed
        // Bs total, honor it — the user paid what was shown on screen.
        if (effectiveCartTotal > _totalPaidCheck) {
            const totalBsPaid = sumR(payments.filter(p => p.currency === 'BS').map(p => p.amountInput || 0));
            if (totalBsPaid > 0) {
                const cfg = useTablesStore.getState().config;
                const shownBs = calculateGrandTotalBs(
                    tableCheckoutData.timeCost || 0,
                    tableCheckoutData.totalConsumption || 0,
                    session?.game_mode, cfg, effectiveRate,
                    calculateSessionCostBreakdown(tableCheckoutData.elapsed, session?.game_mode, cfg, session?.hours_paid, session?.extended_times, hoursOff, roundsOff),
                    calculateConsumptionBs(tableCheckoutData.currentItems || [], effectiveRate, products)                ) + calculateSeatTimeCostBs(seats, cfg, effectiveRate);
                console.log('[TableCheckout] Bs guard: totalBsPaid:', totalBsPaid, 'shownBs:', shownBs);
                if (totalBsPaid >= shownBs - 1) {
                    // User covered the Bs total — snap USD to cover the cart
                    console.log('[TableCheckout] Bs guard: snapping effectiveCartTotal from', effectiveCartTotal, 'to', _totalPaidCheck);
                    effectiveCartTotal = round2(_totalPaidCheck);
                }
            }
        }

        const opts = {
            cart: syntheticCart,
            cartTotalUsd: effectiveCartTotal,
            cartTotalBs: (() => {
                const cfg = useTablesStore.getState().config;
                if (seats.length > 0) {
                    const itf = tableCheckoutData.table?.type === 'NORMAL';
                    const fb = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, cfg, tableCheckoutData.currentItems || [], null, tableCheckoutData.frozenDivisor || null, itf, hoursOff, roundsOff);
                    return fb ? round2(calculateBreakdownTotalBs(fb, cfg, effectiveRate)) : round2(effectiveCartTotal * effectiveRate);
                }
                // Recalculate fresh time cost with offsets for Bs calculation
                const freshTimeCost = calculateSessionCostBreakdown(tableCheckoutData.elapsed, session?.game_mode, cfg, session?.hours_paid, session?.extended_times, hoursOff, roundsOff).total;
                return calculateGrandTotalBs(freshTimeCost, tableCheckoutData.totalConsumption, tableCheckoutData.session?.game_mode, cfg, effectiveRate, null, calculateConsumptionBs(tableCheckoutData.currentItems || [], effectiveRate));
            })(),
            cartSubtotalUsd: effectiveCartTotal,
            payments, changeBreakdown, selectedCustomerId, customers, products,
            effectiveRate, tasaCop, copEnabled,
            discountData: tableCheckoutData.discountData || { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 },
            useAutoRate, splitMeta,
            skipStockDeduction: true // Stock already deducted when items were added to order
        };

        opts.tableName = seatId
            ? `${tableCheckoutData.table?.name || 'Mesa'} (${seats.find(s => s.id === seatId)?.label || 'Persona'})`
            : (tableCheckoutData.table?.name || null);

        if (tableCheckoutData.session?.opened_by) {
            const cachedUsers = useAuthStore.getState().cachedUsers || [];
            let openerUser = cachedUsers.find(u => u.id === tableCheckoutData.session.opened_by) || null;
            if (!openerUser) {
                try {
                    const { supabaseCloud } = await import('../config/supabaseCloud');
                    const { data } = await supabaseCloud.from('staff_users').select('id, name, role').eq('id', tableCheckoutData.session.opened_by).single();
                    if (data) openerUser = data;
                } catch (_) {}
            }
            const openerRole = (openerUser?.role || openerUser?.rol || '').toUpperCase();
            if (openerRole === 'MESERO' || openerRole === 'BARRA') {
                opts.meseroId = openerUser.id;
                opts.meseroNombre = openerUser.name || openerUser.nombre || null;
            }
        }

        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return { success: false };
        }

        setProductsAfterCheckout(result.updatedProducts);
        if (result.updatedCustomers) setCustomers(result.updatedCustomers);
        setSalesData(prev => [result.sale, ...prev]);

        // Per-seat: mark seat as paid
        if (seatId && seats.length > 0) {
            try {
                const updatedSeats = seats.map(s => s.id === seatId ? { ...s, paid: true } : s);
                await useTablesStore.getState().updateSessionSeats(session.id, updatedSeats);
                const allPaid = updatedSeats.every(s => s.paid);
                if (allPaid) {
                    // All seats paid — show release dialog (shouldRelease = null lets caller decide)
                    // Don't auto-release — let post-payment dialog handle it
                } else {
                    // More seats to pay — refresh checkout data with updated seats so bill modal reopens
                    setTableCheckoutData(prev => prev ? ({
                        ...prev,
                        session: { ...prev.session, seats: updatedSeats },
                        seatId: undefined, // clear seat selection so bill modal shows (not checkout)
                    }) : null);
                    showToast(`${seats.find(s => s.id === seatId)?.label || 'Persona'} pagado`, 'success');
                }
            } catch (e) {
                showToast("Venta completa, pero falló al marcar asiento como pagado.", "warning");
            }
            setShowReceipt(result.sale);
            playCheckout();
            setShowConfetti(true);
            notifyLowStock(result.updatedProducts);
            setSelectedCustomerId('');
            return;
        }

        // Si shouldRelease es null, el caller maneja la decisión (post-payment dialog)
        if (shouldRelease !== null) {
            try {
                if (shouldRelease) {
                    await useTablesStore.getState().closeSession(tableCheckoutData.session.id);
                } else {
                    await useTablesStore.getState().resetSessionAfterPayment(tableCheckoutData.session.id);
                    await useOrdersStore.getState().cancelOrderBySessionId(tableCheckoutData.session.id);
                }
            } catch (error) {
                showToast("Venta completa, pero falló al actualizar la mesa.", "warning");
            }
            setTableCheckoutData(null);
        }
        // Si shouldRelease === null, NO limpiar tableCheckoutData — el caller lo necesita para el dialog

        setShowReceipt(result.sale);
        playCheckout();
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setSelectedCustomerId('');
    }, [tableCheckoutData, effectiveRate, tasaCop, copEnabled, customers, products, useAutoRate, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, setTableCheckoutData, setSelectedCustomerId, setShowConfetti, playCheckout, playError, notifyLowStock, triggerHaptic]);

    const handleCreateCustomer = useCallback(async (name, documentId, phone) => {
        const newCustomer = { id: crypto.randomUUID(), name, documentId: documentId || '', phone: phone || '', deuda: 0, favor: 0, createdAt: new Date().toISOString() };
        const updated = [...customers, newCustomer];
        setCustomers(updated);
        await storageService.setItem('bodega_customers_v1', updated);
        return newCustomer;
    }, [customers, setCustomers]);

    const handleAddCustomAmount = useCallback((amount, currency, addToCart, setShowCustomAmountModal) => {
        let amountUsd = 0;
        let exactBsToStore = null;
        if (currency === 'USD') {
            amountUsd = round2(amount);
        } else if (currency === 'COP') {
            const tasaCopVal = typeof tasaCop !== 'undefined' ? tasaCop : (parseFloat(localStorage.getItem('tasa_cop')) || 4150);
            amountUsd = divR(amount, tasaCopVal);
        } else {
            amountUsd = divR(amount, effectiveRate);
            exactBsToStore = round2(amount);
        }
        if (amountUsd <= 0) return;
        addToCart({ id: crypto.randomUUID(), name: 'Venta Libre', priceUsdt: amountUsd, exactBs: exactBsToStore, costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 });
        setShowCustomAmountModal(false);
    }, [effectiveRate, tasaCop]);

    return { handleCheckoutWithCustomer, handleTableCheckout, handleCreateCustomer, handleAddCustomAmount };
}
