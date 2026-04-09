import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';
import { scopedKey } from './accountScope';

const ordersCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "orders_cache"
});

export const useOrdersStore = create((set, get) => ({
    orders: [], // Todas las órdenes abiertas
    orderItems: [], // Todos los items pertenecientes a órdenes abiertas
    loading: true,
    realtimeChannel: null,

    init: async () => {
        set({ loading: true });
        try {
            const cachedOrders = await ordersCache.getItem(scopedKey(scopedKey('active_orders'))) || [];
            const cachedItems = await ordersCache.getItem(scopedKey(scopedKey('active_order_items'))) || [];
            set({ orders: cachedOrders, orderItems: cachedItems, loading: false });
            
            // Sync initial state
            get().syncOrders();
        } catch (e) {
            console.error('Error loading orders cache:', e);
            set({ loading: false });
        }
    },

    subscribeToRealtime: () => {
        if (get().realtimeChannel) return;

        let syncTimeout;
        const debouncedSync = () => {
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => get().syncOrders(), 300);
        };

        const channel = supabaseCloud
            .channel('pool_orders_sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                console.log("[REALTIME] orders change received:", payload);
                if (payload.eventType === 'UPDATE') {
                    set(state => ({ orders: state.orders.map(o => o.id === payload.new.id ? payload.new : o) }));
                } else if (payload.eventType === 'INSERT') {
                    set(state => ({ orders: [...state.orders.filter(o => o.id !== payload.new.id), payload.new] }));
                } else if (payload.eventType === 'DELETE') {
                    set(state => ({ orders: state.orders.filter(o => o.id !== payload.old.id) }));
                }
                debouncedSync();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
                console.log("[REALTIME] order_items change received:", payload);
                if (payload.eventType === 'UPDATE') {
                    set(state => ({ orderItems: state.orderItems.map(i => i.id === payload.new.id ? payload.new : i) }));
                } else if (payload.eventType === 'INSERT') {
                    set(state => ({ orderItems: [...state.orderItems.filter(i => i.id !== payload.new.id), payload.new] }));
                } else if (payload.eventType === 'DELETE') {
                    set(state => ({ orderItems: state.orderItems.filter(i => i.id !== payload.old.id) }));
                }
                debouncedSync();
            })
            .subscribe((status) => {
                console.log("[REALTIME] status pool_orders_sync:", status);
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn('[REALTIME] Error en canal orders — reintentando en 5s');
                    setTimeout(() => {
                        get().unsubscribeFromRealtime();
                        get().subscribeToRealtime();
                    }, 5000);
                }
            });
        set({ realtimeChannel: channel });
    },

    unsubscribeFromRealtime: () => {
        if (get().realtimeChannel) {
            supabaseCloud.removeChannel(get().realtimeChannel);
            set({ realtimeChannel: null });
        }
    },

    syncOrders: async () => {
        try {
            // Fetch OPEN table_sessions to get active orders
            const { data: openOrders, error: orderError } = await supabaseCloud
                .from('orders')
                .select('*')
                .eq('status', 'OPEN');
            if (orderError) throw orderError;

            const orderIds = openOrders.map(o => o.id);
            let items = [];
            
            if (orderIds.length > 0) {
                const { data: openItems, error: itemsError } = await supabaseCloud
                    .from('order_items')
                    .select('*')
                    .in('order_id', orderIds);
                if (itemsError) throw itemsError;
                items = openItems;
            }

            set({ orders: openOrders, orderItems: items });
            await ordersCache.setItem(scopedKey('active_orders'), openOrders);
            await ordersCache.setItem(scopedKey('active_order_items'), items);
            return { orders: openOrders, orderItems: items };
        } catch (err) {
            console.error('Error syncOrders:', err);
        }
    },

    getOrderBySessionId: (sessionId) => {
        return get().orders.find(o => o.table_session_id === sessionId);
    },

    getItemsByOrderId: (orderId) => {
        return get().orderItems.filter(i => i.order_id === orderId);
    },

    // Añade un ítem a la sesión (crea la orden si no existe)
    addItemToSession: async (tableId, sessionId, creatorId, productInfo, exchangeRate = 1) => {
        let order = get().getOrderBySessionId(sessionId);
        
        try {
            if (!order) {
                // Crear orden
                const { data: newOrder, error: orderErr } = await supabaseCloud
                    .from('orders')
                    .insert([{
                        table_id: tableId,
                        table_session_id: sessionId,
                        created_by: creatorId,
                        status: 'OPEN',
                        total_usd: 0,
                        total_bs: 0,
                        exchange_rate_used: exchangeRate
                    }])
                    .select()
                    .single();
                
                if (orderErr) throw orderErr;
                order = newOrder;
                const newOrders = [...get().orders, order];
                set({ orders: newOrders });
                await ordersCache.setItem(scopedKey('active_orders'), newOrders);
            }

            // Chequear si el producto ya existe en la orden
            const existingItem = get().orderItems.find(i => i.order_id === order.id && i.product_id === productInfo.id);

            if (existingItem) {
                const { data: updatedItem, error: err } = await supabaseCloud
                    .from('order_items')
                    .update({ qty: existingItem.qty + 1 })
                    .eq('id', existingItem.id)
                    .select()
                    .single();
                if (err) throw err;
                
                const newItems = get().orderItems.map(i => i.id === updatedItem.id ? updatedItem : i);
                set({ orderItems: newItems });
                await ordersCache.setItem(scopedKey('active_order_items'), newItems);
            } else {
                const { data: newItem, error: err } = await supabaseCloud
                    .from('order_items')
                    .insert([{
                        order_id: order.id,
                        product_id: productInfo.id,
                        product_name: productInfo.name,
                        unit_price_usd: productInfo.priceUsd || productInfo.priceUsdt || productInfo.price || 0,
                        qty: 1,
                        added_by: creatorId
                    }])
                    .select()
                    .single();
                
                if (err) throw err;
                const newItems = [...get().orderItems, newItem];
                set({ orderItems: newItems });
                await ordersCache.setItem(scopedKey('active_order_items'), newItems);
            }

        } catch (e) {
            console.error('Error adding item to session:', e);
            throw e; // Relaunch
        }
    },

    deleteItem: async (itemId) => {
         try {
            const { error } = await supabaseCloud.from('order_items').delete().eq('id', itemId);
            if (error) throw error;
            const newItems = get().orderItems.filter(i => i.id !== itemId);
            set({ orderItems: newItems });
            await ordersCache.setItem(scopedKey('active_order_items'), newItems);
         } catch (e) {
             console.error('Error deleting item:', e);
         }
    },

    updateItemQty: async (itemId, newQty) => {
        try {
            if (newQty <= 0) {
                return get().deleteItem(itemId);
            }
            const { data: updatedItem, error } = await supabaseCloud
                .from('order_items')
                .update({ qty: newQty })
                .eq('id', itemId)
                .select()
                .single();
            if (error) throw error;

            const newItems = get().orderItems.map(i => i.id === itemId ? updatedItem : i);
            set({ orderItems: newItems });
            await ordersCache.setItem(scopedKey('active_order_items'), newItems);
        } catch (e) {
            console.error('Error updating item qty:', e);
            throw e;
        }
    },

    cancelOrderBySessionId: async (sessionId) => {
        let order = get().getOrderBySessionId(sessionId);
        if (!order) return;

        // Guardar estado previo para rollback
        const prevOrders = get().orders;
        const prevItems = get().orderItems;

        // Optimistic update FIRST
        const newOrders = prevOrders.filter(o => o.id !== order.id);
        const newItems = prevItems.filter(i => i.order_id !== order.id);

        set({ orders: newOrders, orderItems: newItems });
        await ordersCache.setItem(scopedKey('active_orders'), newOrders);
        await ordersCache.setItem(scopedKey('active_order_items'), newItems);

        try {
            // Background network tasks
            await supabaseCloud.from('order_items').delete().eq('order_id', order.id);
            await supabaseCloud.from('orders').delete().eq('id', order.id);
        } catch (e) {
            console.error('Error canceling order (network) — rolling back:', e);
            // Rollback: restaurar estado local
            set({ orders: prevOrders, orderItems: prevItems });
            await ordersCache.setItem(scopedKey('active_orders'), prevOrders);
            await ordersCache.setItem(scopedKey('active_order_items'), prevItems);
            throw e;
        }
    }
}));

useOrdersStore.getState().init();
