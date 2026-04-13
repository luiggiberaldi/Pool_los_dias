import { useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { round2, divR } from '../utils/dinero';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useAuthStore } from './store/authStore';
import { calculateGrandTotalBs, calculateSessionCostBreakdown, formatHoursPaid, calculateSeatCostBreakdown, calculateFullTableBreakdown } from '../utils/tableBillingEngine';

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
        const session = tableCheckoutData.session;
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

            // Time cost for this seat
            if (seatTimeCost.pinaCost > 0) {
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Piña ${tableName}`,
                    priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                    qty: seat.pinas || 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (seatTimeCost.hourCost > 0) {
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo ${tableName} (${formatHoursPaid(seat.hoursPaid || 0)})`,
                    priceUsdt: round2(seatTimeCost.hourCost), priceUsd: round2(seatTimeCost.hourCost),
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (seatTimeCost.libreCost > 0) {
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo libre ${tableName}`,
                    priceUsdt: round2(seatTimeCost.libreCost), priceUsd: round2(seatTimeCost.libreCost),
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }

            // Seat-specific items
            const seatItems = (tableCheckoutData.currentItems || []).filter(i => i.seat_id === seatId);
            seatItems.forEach(item => {
                const p = products.find(p => p.id === item.product_id);
                syntheticCart.push(p
                    ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: p.costBs || 0, costUsd: p.costUsd || 0 }
                    : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                );
            });

            // Shared portion
            const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || []);
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
        } else {
            // ═══ CLASSIC (FULL TABLE) CHECKOUT ═══
            if (tableCheckoutData.timeCost > 0) {
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
            }
            if (tableCheckoutData.currentItems?.length > 0) {
                tableCheckoutData.currentItems.forEach(item => {
                    const p = products.find(p => p.id === item.product_id);
                    if (p) {
                        syntheticCart.push({ ...p, id: p.id, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: p.costBs || 0, costUsd: p.costUsd || 0 });
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

        const opts = {
            cart: syntheticCart,
            cartTotalUsd: tableCheckoutData.grandTotal,
            cartTotalBs: calculateGrandTotalBs(tableCheckoutData.timeCost, tableCheckoutData.totalConsumption, tableCheckoutData.session?.game_mode, useTablesStore.getState().config, effectiveRate),
            cartSubtotalUsd: tableCheckoutData.grandTotal,
            payments, changeBreakdown, selectedCustomerId, customers, products,
            effectiveRate, tasaCop, copEnabled,
            discountData: tableCheckoutData.discountData || { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 },
            useAutoRate, splitMeta
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
            if (openerRole === 'MESERO') {
                opts.meseroId = openerUser.id;
                opts.meseroNombre = openerUser.name || openerUser.nombre || null;
            }
        }

        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return;
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
                    // More seats to pay — close checkout, go back to bill modal
                    setTableCheckoutData(null);
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
