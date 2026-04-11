import { useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { round2, divR } from '../utils/dinero';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useAuthStore } from './store/authStore';

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
    const handleCheckoutWithCustomer = useCallback(async (payments, changeBreakdown, selectedCustomerId) => {
        triggerHaptic && triggerHaptic();
        const opts = {
            cart, cartTotalUsd, cartTotalBs, cartSubtotalUsd, payments, changeBreakdown,
            selectedCustomerId, customers, products, effectiveRate, tasaCop, copEnabled,
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

    const handleTableCheckout = useCallback(async (payments, changeBreakdown, selectedCustomerId, shouldRelease = true) => {
        if (!tableCheckoutData) return;
        triggerHaptic && triggerHaptic();

        const syntheticCart = [];
        if (tableCheckoutData.timeCost > 0) {
            syntheticCart.push({
                id: crypto.randomUUID(),
                name: `Tiempo Jugado (${tableCheckoutData.table.name})`,
                priceUsdt: tableCheckoutData.timeCost, priceUsd: tableCheckoutData.timeCost,
                qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
            });
        }
        if (tableCheckoutData.currentItems?.length > 0) {
            tableCheckoutData.currentItems.forEach(item => {
                const p = products.find(p => p.id === item.product_id);
                if (p) syntheticCart.push({ ...p, id: p.id, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: p.costBs || 0, costUsd: p.costUsd || 0 });
            });
        }

        const opts = {
            cart: syntheticCart,
            cartTotalUsd: tableCheckoutData.grandTotal,
            cartTotalBs: tableCheckoutData.grandTotal * effectiveRate,
            cartSubtotalUsd: tableCheckoutData.grandTotal,
            payments, changeBreakdown, selectedCustomerId, customers, products,
            effectiveRate, tasaCop, copEnabled,
            discountData: { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 },
            useAutoRate
        };

        // Nombre de la mesa
        opts.tableName = tableCheckoutData.table?.name || null;

        // Atribuir venta al mesero que abrió la mesa (solo si tiene rol MESERO)
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

        try {
            if (shouldRelease) {
                await useTablesStore.getState().closeSession(tableCheckoutData.session.id);
            } else {
                // Limpiar deuda: resetear sesión (hours_paid=0, status=ACTIVE) y borrar order items
                await useTablesStore.getState().resetSessionAfterPayment(tableCheckoutData.session.id);
                await useOrdersStore.getState().cancelOrderBySessionId(tableCheckoutData.session.id);
            }
        } catch (error) {
            showToast("Venta completa, pero falló al actualizar la mesa.", "warning");
        }

        setShowReceipt(result.sale);
        playCheckout();
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setTableCheckoutData(null);
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
