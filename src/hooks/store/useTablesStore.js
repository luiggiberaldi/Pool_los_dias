import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';
import { scopedKey } from './accountScope';

const getUser = () => useAuthStore.getState().currentUser;

// Helper: obtener user_id del usuario Supabase autenticado
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

const tablesCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "tables_cache"
});

const PENDING_KEY_BASE = 'pool_pending_table_actions';
const getPendingKey = () => scopedKey(PENDING_KEY_BASE);

const sortTables = (tables) => {
    if (!tables) return [];
    return [...tables].sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
};

export const useTablesStore = create((set, get) => ({
    tables: [],
    activeSessions: [],
    paidHoursOffsets: {}, // { [sessionId]: number } — horas ya cobradas, guardadas solo localmente
    paidRoundsOffsets: {}, // { [sessionId]: number } — piñas ya cobradas, guardadas solo localmente
    loading: true,
    realtimeChannel: null,
    _onlineHandler: null,

    config: {
        pricePerHour: 5,
        pricePerHourBs: 0,
        pricePina: 2,
        pricePinaBs: 0,
    },

    init: async () => {
        set({ loading: true });
        try {
            // 1. Cargar config
            const cachedConfig = await tablesCache.getItem(scopedKey('pool_config'));
            if (cachedConfig) set({ config: cachedConfig });

            // 2. Cargar cache local (Lo que quedó guardado al irse la luz)
            const cachedTables = await tablesCache.getItem(scopedKey('tables')) || [];
            const cachedSessions = await tablesCache.getItem(scopedKey('active_sessions')) || [];
            const cachedOffsets = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
            const cachedRoundsOffsets = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};

            set({
                tables: sortTables(cachedTables),
                activeSessions: cachedSessions,
                paidHoursOffsets: cachedOffsets,
                paidRoundsOffsets: cachedRoundsOffsets,
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
                const handler = () => get().processPendingActions();
                window.addEventListener('online', handler);
                set({ _onlineHandler: handler });
            }

        } catch (error) {
            console.error('Error in useTablesStore init:', error);
            set({ loading: false });
        }
    },

    // --- GESTIÓN DE COLA OFFLINE ---
    addPendingAction: async (action) => {
        const queue = await tablesCache.getItem(getPendingKey()) || [];
        // Deduplicar: si ya existe una acción del mismo tipo+sessionId, reemplazarla con la más reciente
        const isDuplicate = (a, b) => a.type === b.type && a.sessionId === b.sessionId;
        const filtered = queue.filter(existing => !isDuplicate(existing, action));
        filtered.push({ ...action, id: Date.now(), timestamp: new Date().toISOString() });
        await tablesCache.setItem(getPendingKey(), filtered);
    },

    processPendingActions: async () => {
        const queue = await tablesCache.getItem(getPendingKey()) || [];
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

        await tablesCache.setItem(getPendingKey(), remainingQueue);
        if (remainingQueue.length === 0) {
            get().syncTablesAndSessions(); // Refrescar IDS reales de la nube
        }
    },

    // --- ACCIONES CORE ---

    updateConfig: async (newConfig) => {
        const merged = { ...get().config, ...newConfig };
        set({ config: merged });
        await tablesCache.setItem(scopedKey('pool_config'), merged);

        try {
            // Intentar actualizar con los nuevos campos Bs
            const { error } = await supabaseCloud.from('pool_config').update({
                price_per_hour: merged.pricePerHour,
                price_per_hour_bs: merged.pricePerHourBs || 0,
                price_pina: merged.pricePina,
                price_pina_bs: merged.pricePinaBs || 0,
                updated_at: new Date().toISOString()
            }).eq('id', 1);
            // Si falla por columnas nuevas, reintentar sin ellas
            if (error && error.message?.includes('column')) {
                await supabaseCloud.from('pool_config').update({
                    price_per_hour: merged.pricePerHour,
                    price_pina: merged.pricePina,
                    updated_at: new Date().toISOString()
                }).eq('id', 1);
            }
        } catch (e) {
            console.error('Error updating config in cloud', e);
        }
    },

    syncTablesAndSessions: async () => {
        try {
            const userId = await getAuthUserId();

            let tablesQuery = supabaseCloud
                .from('tables')
                .select('*')
                .eq('active', true)
                .order('name', { ascending: true });
            if (userId) tablesQuery = tablesQuery.eq('user_id', userId);

            const { data: tablesData, error: tablesError } = await tablesQuery;

            if (tablesError) throw tablesError;

            let sessionsQuery = supabaseCloud
                .from('table_sessions')
                .select('*')
                .in('status', ['ACTIVE', 'CHECKOUT']);
            if (userId) sessionsQuery = sessionsQuery.eq('user_id', userId);

            const { data: sessionsData, error: sessionsError } = await sessionsQuery;

            if (sessionsError) throw sessionsError;

            let configQuery = supabaseCloud
                .from('pool_config')
                .select('*')
                .eq('id', 1);
            if (userId) configQuery = configQuery.eq('user_id', userId);

            const { data: configData, error: configError } = await configQuery.maybeSingle();

            if (!configError && configData) {
                const cloudConfig = {
                    pricePerHour: Number(configData.price_per_hour) || get().config.pricePerHour,
                    pricePerHourBs: Number(configData.price_per_hour_bs) || get().config.pricePerHourBs || 0,
                    pricePina: Number(configData.price_pina) || get().config.pricePina,
                    pricePinaBs: Number(configData.price_pina_bs) || get().config.pricePinaBs || 0,
                };
                set({ config: cloudConfig });
                await tablesCache.setItem(scopedKey('pool_config'), cloudConfig);
            }

            // Restaurar paid_at local (no existe en Supabase) sobre las sesiones recién sincronizadas
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            const mergedSessions = sessionsData.map(s =>
                paidCache[s.id] ? { ...s, paid_at: paidCache[s.id] } : s
            );

            const finalTables = sortTables(tablesData);
            set({ tables: finalTables, activeSessions: mergedSessions });

            await tablesCache.setItem(scopedKey('tables'), finalTables);
            await tablesCache.setItem(scopedKey('active_sessions'), mergedSessions);

            // Restaurar paidHoursOffsets y paidRoundsOffsets desde cache (datos locales que no están en Supabase)
            const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
            const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
            set({ paidHoursOffsets: offsetCache, paidRoundsOffsets: roundsOffsetCache });

        } catch (error) {
            console.warn('Sync cloud fallido (Modo Offline activo):', error.message);
        }
    },

    subscribeToRealtime: () => {
        if (get().realtimeChannel) return;

        const debouncedSync = () => {
            clearTimeout(get()._syncTimeout);
            const t = setTimeout(() => get().syncTablesAndSessions(), 300);
            set({ _syncTimeout: t });
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
        clearTimeout(get()._syncTimeout);
        if (get().realtimeChannel) {
            supabaseCloud.removeChannel(get().realtimeChannel);
            set({ realtimeChannel: null, _syncTimeout: null });
        }
    },

    destroy: () => {
        get().unsubscribeFromRealtime();
        const handler = get()._onlineHandler;
        if (handler && typeof window !== 'undefined') {
            window.removeEventListener('online', handler);
            set({ _onlineHandler: null });
        }
    },

    openSession: async (tableId, staffId, gameMode = 'NORMAL', hoursPaid = 0, clientName = '', guestCount = 0, clientId = null) => {
        const userId = await getAuthUserId();

        // Cerrar sesiones huérfanas (ACTIVE/CHECKOUT) para la misma mesa
        // Previene que un mismo table_id tenga múltiples sesiones abiertas a la vez
        const orphans = get().activeSessions.filter(
            s => s.table_id === tableId && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
        );
        if (orphans.length > 0) {
            const cleanedSessions = get().activeSessions.filter(s => s.table_id !== tableId);
            set({ activeSessions: cleanedSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), cleanedSessions);
            for (const orphan of orphans) {
                try {
                    await supabaseCloud.from('table_sessions')
                        .update({ status: 'CLOSED', closed_at: new Date().toISOString(), total_cost_usd: 0 })
                        .eq('id', orphan.id);
                } catch { /* ignorar */ }
            }
        }

        const sessionPayload = {
            table_id: tableId,
            opened_by: staffId,
            game_mode: gameMode,
            hours_paid: hoursPaid,
            status: 'ACTIVE',
            started_at: new Date().toISOString(),
            ...(clientName ? { client_name: clientName } : {}),
            ...(guestCount > 0 ? { guest_count: guestCount } : {}),
            ...(clientId ? { client_id: clientId } : {}),
        };
        if (userId) sessionPayload.user_id = userId;

        // ID temporal para UI
        const fakeId = 'temp-' + Date.now();
        const optimisticSession = { ...sessionPayload, id: fakeId };

        const newSessions = [...get().activeSessions, optimisticSession];
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        const tableName = get().tables.find(t => t.id === tableId)?.name ?? tableId;
        const modeLabel = gameMode === 'PINA' ? 'La Piña' : gameMode === 'PREPAGO' ? `Prepago ${hoursPaid}h` : 'Normal';
        logEvent('MESAS', 'MESA_ABIERTA', `Mesa ${tableName} abierta · ${modeLabel}`, getUser(), { tableId, gameMode, hoursPaid });

        try {
            const { data, error } = await supabaseCloud.from('table_sessions').insert(sessionPayload).select().single();
            if (error) throw error;

            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === fakeId ? data : s)
            }));
            await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);

        } catch (error) {
            console.warn('Guardado en nube fallido, encolado para más tarde.');
            // Rollback: reemplazar sesión temporal con una marcada como pendiente
            set(state => ({
                activeSessions: state.activeSessions.map(s =>
                    s.id === fakeId ? { ...s, _pendingSync: true } : s
                )
            }));
            await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
            await get().addPendingAction({ type: 'OPEN_SESSION', payload: sessionPayload });
        }
    },

    closeSession: async (sessionId, staffId, totalCost, paymentMethod = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        const tableName = session ? (get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id) : sessionId;

        const updatedList = get().activeSessions.filter(s => s.id !== sessionId);
        set({ activeSessions: updatedList });
        await tablesCache.setItem(scopedKey('active_sessions'), updatedList);

        // Limpiar paid_at, hours_offset y rounds_offset del cache local al cerrar la sesión
        const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
        if (paidCache[sessionId]) {
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }
        const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
        if (offsetCache[sessionId] !== undefined) {
            delete offsetCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
            const newOffsets = { ...get().paidHoursOffsets };
            delete newOffsets[sessionId];
            set({ paidHoursOffsets: newOffsets });
        }
        const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
        if (roundsOffsetCache[sessionId] !== undefined) {
            delete roundsOffsetCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
            const newRoundsOffsets = { ...get().paidRoundsOffsets };
            delete newRoundsOffsets[sessionId];
            set({ paidRoundsOffsets: newRoundsOffsets });
        }

        const cost = Number(totalCost);
        logEvent('MESAS', 'MESA_CERRADA', `Mesa ${tableName} cerrada${cost > 0 ? ` · $${cost.toFixed(2)}` : ''}`, getUser(), { sessionId, totalCost, paymentMethod });

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

    updateSessionMetadata: async (sessionId, clientName, guestCount, clientId = null) => {
        const payload = {
            client_name: clientName || null,
            guest_count: guestCount || 0,
            ...(clientId !== undefined ? { client_id: clientId } : {}),
        };
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, ...payload } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            const { error } = await supabaseCloud.from('table_sessions').update(payload).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload });
        }
    },

    updateSessionTime: async (sessionId, newStartedAt) => {
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, started_at: newStartedAt } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

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
        const newHours = Math.max(0, (Number(session.hours_paid) || 0) + additionalHours);

        // Si la sesión estaba "cobrada sin liberar", limpiar paid_at para reactivar billing del tiempo nuevo
        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, hours_paid: newHours, paid_at: null } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ hours_paid: newHours }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { hours_paid: newHours } });
        }
    },

    // "Cobrar sin liberar": marca la sesión como pagada sin cerrarla.
    // paid_at y hours_offset se guardan SOLO localmente (no en Supabase).
    // El timer sigue corriendo (hours_paid intacto), billing = $0.
    // Al agregar más horas, solo se cobra la diferencia.
    resetSessionAfterPayment: async (sessionId) => {
        const paidAt = new Date().toISOString();
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        // 1. Guardar paid_at en cache persistente
        const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
        paidCache[sessionId] = paidAt;
        await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

        // 2. Guardar hours_offset = horas ya cobradas (billing diferencial al agregar más tiempo)
        const currentHours = Number(session.hours_paid) || 0;
        const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
        offsetCache[sessionId] = currentHours;
        await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
        set({ paidHoursOffsets: { ...get().paidHoursOffsets, [sessionId]: currentHours } });

        // 2b. Guardar rounds_offset = piñas ya cobradas (billing diferencial para modo PIÑA)
        if (session.game_mode === 'PINA') {
            const currentRounds = 1 + (Number(session.extended_times) || 0);
            const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
            roundsOffsetCache[sessionId] = currentRounds;
            await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
            set({ paidRoundsOffsets: { ...get().paidRoundsOffsets, [sessionId]: currentRounds } });
        }

        // 3. Update local state
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, status: 'ACTIVE', paid_at: paidAt } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        // 4. Solo mandamos status a Supabase (paid_at no existe como columna)
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', sessionId);
            if (error) throw error;
            get().syncTablesAndSessions();
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'ACTIVE' } });
        }
    },

    addRoundToSession: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newRounds = (Number(session.extended_times) || 0) + 1;
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        // Si estaba marcada como "ya cobrada", limpiar paid_at del cache al agregar nueva piña
        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, extended_times: newRounds, paid_at: null } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        logEvent('MESAS', 'MESA_PIÑA_AGREGADA', `Mesa ${tableName} · Piña añadida (total: ${newRounds})`, getUser(), { sessionId, newRounds });

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
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        const newSessions = get().activeSessions.map(s => s.id === sessionId ? { ...s, extended_times: newRounds } : s);
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        logEvent('MESAS', 'MESA_PIÑA_QUITADA', `Mesa ${tableName} · Piña removida (total: ${newRounds})`, getUser(), { sessionId, newRounds });

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newRounds } });
        }
    },

    requestCheckout: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        // Cancelar cualquier otra sesión de la misma mesa que esté en CHECKOUT
        // (previene duplicados en la cola de caja)
        const tableId = session.table_id;
        const otherCheckouts = get().activeSessions.filter(
            s => s.id !== sessionId && s.table_id === tableId && s.status === 'CHECKOUT'
        );

        const newSessions = get().activeSessions.map(s => {
            if (s.id === sessionId) return { ...s, status: 'CHECKOUT' };
            if (s.table_id === tableId && s.status === 'CHECKOUT') return { ...s, status: 'ACTIVE' };
            return s;
        });
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        // Revertir otras sesiones CHECKOUT de la misma mesa en Supabase
        for (const other of otherCheckouts) {
            try {
                await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', other.id);
            } catch { /* ignorar, se intentará después */ }
        }

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
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'ACTIVE' } });
        }
    },

    // --- ADMINISTRACIÓN DE MESAS ---
    addTable: async (name, type = 'POOL') => {
            const userId = await getAuthUserId();
            const insertPayload = { name, type, status: 'libre', active: true };
            if (userId) insertPayload.user_id = userId;
            const { data, error } = await supabaseCloud.from('tables').insert([insertPayload]).select().single();
            if (error) throw error;
            set(state => ({ tables: sortTables([...state.tables, data]) }));
            await tablesCache.setItem(scopedKey('tables'), get().tables);
            logEvent('MESAS', 'MESA_CREADA', `Mesa "${name}" creada (${type})`, getUser(), { tableId: data.id, name, type });
            return data;
    },

    updateTable: async (id, updates) => {
        set(state => ({ tables: sortTables(state.tables.map(t => t.id === id ? { ...t, ...updates } : t)) }));
        await tablesCache.setItem(scopedKey('tables'), get().tables);
        try {
            const { error } = await supabaseCloud.from('tables').update(updates).eq('id', id);
            if (error) throw error;
        } catch (e) { console.error('Update table cloud fail:', e); }
    },

    deleteTable: async (id) => {
        const tableName = get().tables.find(t => t.id === id)?.name ?? id;
        set(state => ({ tables: state.tables.filter(t => t.id !== id) }));
        await tablesCache.setItem(scopedKey('tables'), get().tables);
        logEvent('MESAS', 'MESA_ELIMINADA', `Mesa "${tableName}" eliminada`, getUser(), { tableId: id });
        const { error } = await supabaseCloud.from('tables').update({ active: false }).eq('id', id);
        if (error) {
            // Revert optimistic update on failure
            await get().syncTablesAndSessions();
            throw error;
        }
    }
}));

// Initialize
useTablesStore.getState().init();
