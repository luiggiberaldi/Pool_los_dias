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
            } else {
                await cashCache.removeItem('active_cash_session');
                set({ activeCashSession: null });
            }
        } catch (error) {
            console.error('Failed to sync cash session:', error);
        }
    }
}));

useCashStore.getState().init();
