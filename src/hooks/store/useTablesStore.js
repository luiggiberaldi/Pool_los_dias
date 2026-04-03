import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';

const tablesCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "tables_cache"
});

export const useTablesStore = create((set, get) => ({
    tables: [],
    activeSessions: [],
    loading: true,
    realtimeChannel: null,
    
    config: {
        pricePerHour: 5, // Valor por defecto
        pricePina: 2     // Valor por defecto
    },

    init: async () => {
        set({ loading: true });
        try {
            // 1. Cargar config
            const cachedConfig = await tablesCache.getItem('pool_config');
            if (cachedConfig) {
                set({ config: cachedConfig });
            }

            // 2. Cargar cache
            const cachedTables = await tablesCache.getItem('tables') || [];
            const cachedSessions = await tablesCache.getItem('active_sessions') || [];
            
            set({ 
                tables: cachedTables, 
                activeSessions: cachedSessions,
                loading: false 
            });

            // 3. Sync network if online
            get().syncTablesAndSessions();
        } catch (error) {
            console.error('Error in useTablesStore init:', error);
            set({ loading: false });
        }
    },

    updateConfig: async (newConfig) => {
        const merged = { ...get().config, ...newConfig };
        set({ config: merged });
        await tablesCache.setItem('pool_config', merged);
    },

    syncTablesAndSessions: async () => {
        try {
            // Get all visible tables
            const { data: tablesData, error: tablesError } = await supabaseCloud
                .from('tables')
                .select('*')
                .eq('active', true)
                .order('name', { ascending: true });

            if (tablesError) throw tablesError;

            // Get active/paused sessions
            const { data: sessionsData, error: sessionsError } = await supabaseCloud
                .from('table_sessions')
                .select('*')
                .in('status', ['ACTIVE', 'CHECKOUT']);

            if (sessionsError) throw sessionsError;

            await tablesCache.setItem('tables', tablesData);
            await tablesCache.setItem('active_sessions', sessionsData);

            set({
                tables: tablesData,
                activeSessions: sessionsData
            });

        } catch (error) {
            console.error('Failed to sync tables and sessions from cloud:', error);
        }
    },

    subscribeToRealtime: () => {
        let channel = get().realtimeChannel;
        if (channel) return;

        channel = supabaseCloud
            .channel('pool_tables_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'table_sessions' },
                (payload) => {
                    console.log('Realtime table_sessions change received!', payload);
                    get().syncTablesAndSessions(); // To keep it simple and accurate, re-sync.
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tables' },
                (payload) => {
                    console.log('Realtime tables change received!', payload);
                    get().syncTablesAndSessions(); 
                }
            )
            .subscribe();

        set({ realtimeChannel: channel });
    },

    unsubscribeFromRealtime: () => {
        const channel = get().realtimeChannel;
        if (channel) {
            supabaseCloud.removeChannel(channel);
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

        // Optimistic UI update
        const fakeId = 'temp-' + Date.now();
        const optimisticSession = { ...sessionPayload, id: fakeId };
        
        set(state => ({
            activeSessions: [...state.activeSessions, optimisticSession]
        }));

        try {
            const { data, error } = await supabaseCloud
                .from('table_sessions')
                .insert(sessionPayload)
                .select()
                .single();

            if (error) throw error;

            // Replace fake with real
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === fakeId ? data : s)
            }));
            
            await tablesCache.setItem('active_sessions', get().activeSessions);

        } catch (error) {
            console.error('Failed to open session on cloud:', error);
            // Revert optimistic
            set(state => ({
                activeSessions: state.activeSessions.filter(s => s.id !== fakeId)
            }));
            throw error;
        }
    },

    closeSession: async (sessionId, staffId, totalCost) => {
        // Optimistic UI update
        const { activeSessions } = get();
        const updatedList = activeSessions.filter(s => s.id !== sessionId);
        set({ activeSessions: updatedList });

        try {
            const { error } = await supabaseCloud
                .from('table_sessions')
                .update({ 
                    status: 'CLOSED',
                    closed_at: new Date().toISOString(),
                    total_cost_usd: totalCost
                })
                .eq('id', sessionId);

            if (error) throw error;
            await tablesCache.setItem('active_sessions', get().activeSessions);

        } catch (error) {
            console.error('Failed to close session on cloud:', error);
            // Sync from network to fix state
            get().syncTablesAndSessions();
            throw error;
        }
    },

    updateSessionTime: async (sessionId, newStartedAt) => {
        try {
            const { error } = await supabaseCloud
                .from('table_sessions')
                .update({ started_at: newStartedAt })
                .eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s =>
                    s.id === sessionId ? { ...s, started_at: newStartedAt } : s
                )
            }));
            await tablesCache.setItem('active_sessions', get().activeSessions);
        } catch (e) {
            console.error('Error updating session time:', e);
            throw e;
        }
    },

    addHoursToSession: async (sessionId, additionalHours) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newHours = (Number(session.hours_paid) || 0) + additionalHours;
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ hours_paid: newHours }).eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === sessionId ? { ...s, hours_paid: newHours } : s)
            }));
            await tablesCache.setItem('active_sessions', get().activeSessions);
        } catch (e) {
            console.error('Error adding hours to session:', e);
            throw e;
        }
    },

    addRoundToSession: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newRounds = (Number(session.extended_times) || 0) + 1;
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === sessionId ? { ...s, extended_times: newRounds } : s)
            }));
            await tablesCache.setItem('active_sessions', get().activeSessions);
        } catch (e) {
            console.error('Error adding round to session:', e);
            throw e;
        }
    },

    removeRoundFromSession: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newRounds = Math.max(0, (Number(session.extended_times) || 0) - 1);
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === sessionId ? { ...s, extended_times: newRounds } : s)
            }));
            await tablesCache.setItem('active_sessions', get().activeSessions);
        } catch (e) {
            console.error('Error removing round from session:', e);
            throw e;
        }
    },

    // Mesero solicita cobro — pasa la sesión a estado CHECKOUT para que el cajero la vea
    requestCheckout: async (sessionId) => {
        // Optimistic: marcar visualmente en la UI del mesero
        set(state => ({
            activeSessions: state.activeSessions.map(s =>
                s.id === sessionId ? { ...s, status: 'CHECKOUT' } : s
            )
        }));
        try {
            const { error } = await supabaseCloud
                .from('table_sessions')
                .update({ status: 'CHECKOUT' })
                .eq('id', sessionId);
            if (error) throw error;
            await tablesCache.setItem('active_sessions', get().activeSessions);
        } catch (e) {
            console.error('Error requesting checkout:', e);
            // Revertir si falla
            set(state => ({
                activeSessions: state.activeSessions.map(s =>
                    s.id === sessionId ? { ...s, status: 'ACTIVE' } : s
                )
            }));
            throw e;
        }
    },

    // Cajero cancela la solicitud de cobro (vuelve a ACTIVE)
    cancelCheckoutRequest: async (sessionId) => {
        set(state => ({
            activeSessions: state.activeSessions.map(s =>
                s.id === sessionId ? { ...s, status: 'ACTIVE' } : s
            )
        }));
        try {
            const { error } = await supabaseCloud
                .from('table_sessions')
                .update({ status: 'ACTIVE' })
                .eq('id', sessionId);
            if (error) throw error;
            await tablesCache.setItem('active_sessions', get().activeSessions);
        } catch (e) {
            console.error('Error canceling checkout request:', e);
            get().syncTablesAndSessions();
            throw e;
        }
    },

    // --- ADMINISTRACIÓN DE MESAS (CRUD) ---
    addTable: async (name, type = 'POOL') => {
        try {
            const { data, error } = await supabaseCloud
                .from('tables')
                .insert([{ 
                    name, 
                    type, 
                    status: 'libre',
                    active: true
                }])
                .select()
                .single();

            if (error) throw error;
            // Optimistic update locally
            set(state => ({ tables: [...state.tables, data] }));
            await tablesCache.setItem('tables', get().tables);
            return data;
        } catch (e) {
            console.error('Error adding table:', e);
            throw e;
        }
    },

    updateTable: async (id, updates) => {
        try {
            const { error } = await supabaseCloud
                .from('tables')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            // Optimistic update
            set(state => ({
                tables: state.tables.map(t => t.id === id ? { ...t, ...updates } : t)
            }));
            await tablesCache.setItem('tables', get().tables);
        } catch (e) {
            console.error('Error updating table:', e);
            throw e;
        }
    },

    deleteTable: async (id) => {
        try {
            const { error } = await supabaseCloud
                .from('tables')
                .delete()
                .eq('id', id);

            if (error) throw error;
            // Optimistic update
            set(state => ({
                tables: state.tables.filter(t => t.id !== id)
            }));
            await tablesCache.setItem('tables', get().tables);
        } catch (e) {
            console.error('Error deleting table:', e);
            throw e;
        }
    }
}));

// Initialize
useTablesStore.getState().init();
