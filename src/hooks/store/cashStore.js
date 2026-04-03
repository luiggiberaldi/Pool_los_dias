import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';

// Dedicated offline cache for cash session state
const cashCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "cash_cache"
});

export const useCashStore = create((set, get) => ({
    activeCashSession: null,
    loading: true,

    init: async () => {
        set({ loading: true });
        try {
            const cachedSession = await cashCache.getItem('active_cash_session');
            set({ activeCashSession: cachedSession, loading: false });
            get().syncCashSession(); // Background sync
        } catch (error) {
            console.error('Error initializing cash store:', error);
            set({ loading: false });
        }
    },

    syncCashSession: async () => {
        try {
            // Get the most recent open session
            const { data, error } = await supabaseCloud
                .from('cash_sessions')
                .select('*')
                .eq('status', 'OPEN')
                .order('opened_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            
            if (data) {
                await cashCache.setItem('active_cash_session', data);
                set({ activeCashSession: data });
            }
            // IF it returns null, don't wipe local cache automatically. 
            // It could be RLS blocking or just that the session hasn't synced yet.
        } catch (error) {
            console.error('Failed to sync cash session:', error);
            // Fallback to local cache if offline
            const cachedSession = await cashCache.getItem('active_cash_session');
            if (cachedSession) set({ activeCashSession: cachedSession });
        }
    },

    openCashSession: async (baseUsd, baseBs, openedBy) => {
        const sessionPayload = {
            id: `cash_${Date.now()}`,
            opened_at: new Date().toISOString(),
            opened_by: openedBy,
            base_usd: baseUsd || 0,
            base_bs: baseBs || 0,
            status: 'OPEN'
        };

        // Guardar locamente para acceso inmediato
        await cashCache.setItem('active_cash_session', sessionPayload);
        set({ activeCashSession: sessionPayload });

        // Intentar registrar en Supabase (si falla, se sincronizará luego, pero la UI ya se desbloqueó)
        try {
            await supabaseCloud.from('cash_sessions').insert(sessionPayload);
        } catch (err) {
            console.warn('Could not sync open session to cloud:', err);
        }
    },

    closeCashSession: async (stats, closedBy) => {
        const active = get().activeCashSession;
        if (!active) return;

        const updatePayload = {
            ...active,
            ...stats,
            closed_at: new Date().toISOString(),
            closed_by: closedBy,
            status: 'CLOSED'
        };

        await cashCache.removeItem('active_cash_session');
        set({ activeCashSession: null });

        try {
            await supabaseCloud.from('cash_sessions')
                .update(updatePayload)
                .eq('id', active.id);
        } catch (err) {
            console.warn('Could not sync close session to cloud:', err);
        }
    }
}));

useCashStore.getState().init();
