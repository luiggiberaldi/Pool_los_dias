import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';

const tablesCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "tables_cache"
});

const PENDING_ACTIONS_KEY = 'pool_pending_table_actions';

const sortTables = (tables) => {
    if (!tables) return [];
    return [...tables].sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
};

export const useTablesStore = create((set, get) => ({
    tables: [],
    activeSessions: [],
    loading: true,
    realtimeChannel: null,
    
    config: {
        pricePerHour: 5,
        pricePina: 2
    },

    init: async () => {
        set({ loading: true });
        try {
            // 1. Cargar config
            const cachedConfig = await tablesCache.getItem('pool_config');
            if (cachedConfig) set({ config: cachedConfig });

            // 2. Cargar cache local (Lo que quedó guardado al irse la luz)
            const cachedTables = await tablesCache.getItem('tables') || [];
            const cachedSessions = await tablesCache.getItem('active_sessions') || [];
            
            set({ 
                tables: sortTables(cachedTables), 
                activeSessions: cachedSessions,
                loading: false 
            });

            // 3. Procesar acciones pendientes antes de sincronizar con la nube
            // Esto asegura que si abrimos una mesa offline, primero se suba a la nube
            // antes de que el Pull de la nube nos la borre.
            await get().processPendingActions();

            // 4. Sync network
            get().syncTablesAndSessions();

            // 5. Escuchar internet para reintentar pendientes
            if (typeof window !== 'undefined') {
                window.addEventListener('online', () => get().processPendingActions());
            }

        } catch (error) {
            console.error('Error in useTablesStore init:', error);
            set({ loading: false });
        }
    },

    // --- GESTIÓN DE COLA OFFLINE ---
    addPendingAction: async (action) => {
        const queue = await tablesCache.getItem(PENDING_ACTIONS_KEY) || [];
        queue.push({ ...action, id: Date.now(), timestamp: new Date().toISOString() });
        await tablesCache.setItem(PENDING_ACTIONS_KEY, queue);
    },

    processPendingActions: async () => {
        const queue = await tablesCache.getItem(PENDING_ACTIONS_KEY) || [];
        if (queue.length === 0) return;

        console.log(`[TablesSync] Procesando ${queue.length} acciones de mesa pendientes...`);
        const remainingQueue = [];

        for (const action of queue) {
            try {
                let success = false;
                if (action.type === 'OPEN_SESSION') {
                    const { error } = await supabaseCloud.from('table_sessions').insert(action.payload);
                    if (!error) success = true;
                } else if (action.type === 'UPDATE_SESSION') {
                    const { error } = await supabaseCloud.from('table_sessions').update(action.payload).eq('id', action.sessionId);
                    if (!error) success = true;
                } else if (action.type === 'CLOSE_SESSION') {
                    const { error } = await supabaseCloud.from('table_sessions').update(action.payload).eq('id', action.sessionId);
                    if (!error) success = true;
                }

                if (!success) remainingQueue.push(action);
            } catch (e) {
                remainingQueue.push(action);
            }
        }

        await tablesCache.setItem(PENDING_ACTIONS_KEY, remainingQueue);
        if (remainingQueue.length === 0) {
            get().syncTablesAndSessions(); // Refrescar IDS reales de la nube
        }
    },

    // --- ACCIONES CORE ---

    updateConfig: async (newConfig) => {
        const merged = { ...get().config, ...newConfig };
        set({ config: merged });
        await tablesCache.setItem('pool_config', merged);

        try {
            await supabaseCloud.from('pool_config').update({
                price_per_hour: merged.pricePerHour,
                price_pina: merged.pricePina,
                updated_at: new Date().toISOString()
            }).eq('id', 1);
        } catch (e) {
            console.error('Error updating config in cloud', e);
        }
    },

    syncTablesAndSessions: async () => {
        try {
            const { data: tablesData, error: tablesError } = await supabaseCloud
                .from('tables')
                .select('*')
                .eq('active', true)
                .order('name', { ascending: true });

            if (tablesError) throw tablesError;

            const { data: sessionsData, error: sessionsError } = await supabaseCloud
                .from('table_sessions')
                .select('*')
                .in('status', ['ACTIVE', 'CHECKOUT']);

            if (sessionsError) throw sessionsError;

            const { data: configData, error: configError } = await supabaseCloud
                .from('pool_config')
                .select('*')
                .eq('id', 1)
                .single();

            if (!configError && configData) {
                const cloudConfig = {
                    pricePerHour: Number(configData.price_per_hour) || get().config.pricePerHour,
                    pricePina: Number(configData.price_pina) || get().config.pricePina
                };
                set({ config: cloudConfig });
                await tablesCache.setItem('pool_config', cloudConfig);
            }

            const finalTables = sortTables(tablesData);
            set({ tables: finalTables, activeSessions: sessionsData });
            
            await tablesCache.setItem('tables', finalTables);
            await tablesCache.setItem('active_sessions', sessionsData);

        } catch (error) {
            console.warn('Sync cloud fallido (Modo Offline activo):', error.message);
        }
    },

    subscribeToRealtime: () => {
        if (get().realtimeChannel) return;

        let syncTimeout;
        const debouncedSync = () => {
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => get().syncTablesAndSessions(), 300);
        };

        const channel = supabaseCloud
            .channel('pool_tables_sync_v2')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, (payload) => {
                console.log("[REALTIME] table_sessions change received:", payload);
                if (payload.eventType === 'UPDATE') {
                    set(state => ({ activeSessions: state.activeSessions.map(s => s.id === payload.new.id ? payload.new : s) }));
                } else if (payload.eventType === 'INSERT') {
                    set(state => ({ activeSessions: [...state.activeSessions.filter(s => s.id !== payload.new.id), payload.new] }));
                } else if (payload.eventType === 'DELETE') {
                    set(state => ({ activeSessions: state.activeSessions.filter(s => s.id !== payload.old.id) }));
                }
                debouncedSync();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, (payload) => {
                 console.log("[REALTIME] tables change received:", payload);
                 if (payload.eventType === 'UPDATE') {
                    set(state => ({ tables: state.tables.map(t => t.id === payload.new.id ? payload.new : t) }));
                } else if (payload.eventType === 'INSERT') {
                    set(state => ({ tables: [...state.tables.filter(t => t.id !== payload.new.id), payload.new] }));
                } else if (payload.eventType === 'DELETE') {
                    set(state => ({ tables: state.tables.filter(t => t.id !== payload.old.id) }));
                }
                debouncedSync();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_config' }, (payload) => {
                console.log("[REALTIME] pool_config change received:", payload);
                if (payload.eventType === 'UPDATE' && payload.new) {
                    set(state => ({
                        config: {
                            pricePerHour: Number(payload.new.price_per_hour) || state.config.pricePerHour,
                            pricePina: Number(payload.new.price_pina) || state.config.pricePina
                        }
                    }));
                }
                debouncedSync();
            })
            .subscribe((status) => {
                console.log("[REALTIME] status pool_tables_sync_v2:", status);
            });
        set({ realtimeChannel: channel });
    },

    unsubscribeFromRealtime: () => {
        if (get().realtimeChannel) {
            supabaseCloud.removeChannel(get().realtimeChannel);
            set({ realtimeChannel: null });
        }
    },

    openSession: async (tableId, staffId, gameMode = 'NORMAL', hoursPaid = 0) => {
        const sessionPayload = {
            table_id: tableId,
            opened_by: staffId,
            game_mode: gameMode,
            hours_paid: hoursPaid,
            status: 'ACTIVE',
            started_at: new Date().toISOString()
        };

        // ID temporal para UI
        const fakeId = 'temp-' + Date.now();
        const optimisticSession = { ...sessionPayload, id: fakeId };
        
        const newSessions = [...get().activeSessions, optimisticSession];
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { data, error } = await supabaseCloud.from('table_sessions').insert(sessionPayload).select().single();
            if (error) throw error;
            
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === fakeId ? data : s)
            }));
            await tablesCache.setItem('active_sessions', get().activeSessions);

        } catch (error) {
            console.warn('Guardado en nube fallido, encolado para más tarde.');
            await get().addPendingAction({ type: 'OPEN_SESSION', payload: sessionPayload });
        }
    },

    closeSession: async (sessionId, staffId, totalCost, paymentMethod = null) => {
        const updatedList = get().activeSessions.filter(s => s.id !== sessionId);
        set({ activeSessions: updatedList });
        await tablesCache.setItem('active_sessions', updatedList);

        const updatePayload = { 
            status: 'CLOSED',
            closed_at: new Date().toISOString(),
            total_cost_usd: totalCost
        };
        if (paymentMethod) updatePayload.payment_method = paymentMethod;

        try {
            const { error } = await supabaseCloud.from('table_sessions').update(updatePayload).eq('id', sessionId);
            if (error) throw error;
        } catch (error) {
            console.warn('Cierre en nube fallido, encolado.');
            await get().addPendingAction({ type: 'CLOSE_SESSION', sessionId, payload: updatePayload });
        }
    },

    updateSessionTime: async (sessionId, newStartedAt) => {
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, started_at: newStartedAt } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ started_at: newStartedAt }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { started_at: newStartedAt } });
        }
    },

    addHoursToSession: async (sessionId, additionalHours) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newHours = (Number(session.hours_paid) || 0) + additionalHours;
        
        const newSessions = get().activeSessions.map(s => s.id === sessionId ? { ...s, hours_paid: newHours } : s);
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ hours_paid: newHours }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { hours_paid: newHours } });
        }
    },

    addRoundToSession: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newRounds = (Number(session.extended_times) || 0) + 1;
        
        const newSessions = get().activeSessions.map(s => s.id === sessionId ? { ...s, extended_times: newRounds } : s);
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newRounds } });
        }
    },

    removeRoundFromSession: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newRounds = Math.max(0, (Number(session.extended_times) || 0) - 1);
        
        const newSessions = get().activeSessions.map(s => s.id === sessionId ? { ...s, extended_times: newRounds } : s);
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newRounds } });
        }
    },

    requestCheckout: async (sessionId) => {
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, status: 'CHECKOUT' } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'CHECKOUT' }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'CHECKOUT' } });
        }
    },

    cancelCheckoutRequest: async (sessionId) => {
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, status: 'ACTIVE' } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem('active_sessions', newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'ACTIVE' } });
        }
    },

    // --- ADMINISTRACIÓN DE MESAS ---
    addTable: async (name, type = 'POOL') => {
        try {
            const { data, error } = await supabaseCloud.from('tables').insert([{ name, type, status: 'libre', active: true }]).select().single();
            if (error) throw error;
            set(state => ({ tables: sortTables([...state.tables, data]) }));
            await tablesCache.setItem('tables', get().tables);
            return data;
        } catch (e) { throw e; }
    },

    updateTable: async (id, updates) => {
        set(state => ({ tables: sortTables(state.tables.map(t => t.id === id ? { ...t, ...updates } : t)) }));
        await tablesCache.setItem('tables', get().tables);
        try {
            const { error } = await supabaseCloud.from('tables').update(updates).eq('id', id);
            if (error) throw error;
        } catch (e) { console.error('Update table cloud fail:', e); }
    },

    deleteTable: async (id) => {
        set(state => ({ tables: state.tables.filter(t => t.id !== id) }));
        await tablesCache.setItem('tables', get().tables);
        try {
            const { error } = await supabaseCloud.from('tables').delete().eq('id', id);
            if (error) throw error;
        } catch (e) { console.error('Delete table cloud fail:', e); }
    }
}));

// Initialize
useTablesStore.getState().init();
