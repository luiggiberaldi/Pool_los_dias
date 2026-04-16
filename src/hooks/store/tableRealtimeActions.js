import { supabaseCloud } from '../../config/supabaseCloud';

export const createRealtimeActions = (set, get, tablesCache, scopedKey) => ({
    subscribeToRealtime: () => {
        if (get().realtimeChannel) return;

        const debouncedSync = () => {
            clearTimeout(get()._syncTimeout);
            const t = setTimeout(() => get().syncTablesAndSessions(), 300);
            set({ _syncTimeout: t });
        };

        const channel = supabaseCloud
            .channel('pool_tables_sync_v2')
            .on('broadcast', { event: 'table_pause' }, ({ payload }) => {
                console.log("[REALTIME] broadcast table_pause:", payload);
                if (payload?.sessionId) {
                    set(state => ({
                        pausedSessions: {
                            ...state.pausedSessions,
                            [payload.sessionId]: { isPaused: true, elapsedAtPause: payload.elapsedAtPause }
                        }
                    }));
                }
            })
            .on('broadcast', { event: 'table_resume' }, ({ payload }) => {
                console.log("[REALTIME] broadcast table_resume:", payload);
                if (payload?.sessionId) {
                    set(state => {
                        const { [payload.sessionId]: _, ...rest } = state.pausedSessions;
                        return { pausedSessions: rest };
                    });
                }
            })
            .on('broadcast', { event: 'table_pause_state_request' }, () => {
                const paused = get().pausedSessions;
                if (Object.keys(paused).length > 0) {
                    get().realtimeChannel?.send({
                        type: 'broadcast',
                        event: 'table_pause_state_sync',
                        payload: { pausedSessions: paused }
                    });
                }
            })
            .on('broadcast', { event: 'table_pause_state_sync' }, ({ payload }) => {
                console.log("[REALTIME] broadcast table_pause_state_sync:", payload);
                if (payload?.pausedSessions) {
                    set(state => ({
                        pausedSessions: { ...payload.pausedSessions, ...state.pausedSessions }
                    }));
                }
            })
            .on('broadcast', { event: 'table_payment_reset' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_payment_reset:", payload);
                if (!payload?.sessionId) return;
                const { sessionId, paidAt, hoursOffset, roundsOffset, hasPinas } = payload;

                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                paidCache[sessionId] = paidAt;
                await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

                const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                offsetCache[sessionId] = hoursOffset;
                await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
                set(state => ({ paidHoursOffsets: { ...state.paidHoursOffsets, [sessionId]: hoursOffset } }));

                if (hasPinas) {
                    const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
                    roundsOffsetCache[sessionId] = roundsOffset;
                    await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
                    set(state => ({ paidRoundsOffsets: { ...state.paidRoundsOffsets, [sessionId]: roundsOffset } }));
                }

                set(state => ({
                    activeSessions: state.activeSessions.map(s =>
                        s.id === sessionId ? { ...s, paid_at: paidAt, status: 'ACTIVE' } : s
                    )
                }));
            })
            .on('broadcast', { event: 'table_offsets_state_request' }, async () => {
                const paidHoursOffsets = get().paidHoursOffsets;
                const paidRoundsOffsets = get().paidRoundsOffsets;
                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                if (Object.keys(paidHoursOffsets).length > 0 || Object.keys(paidRoundsOffsets).length > 0) {
                    get().realtimeChannel?.send({
                        type: 'broadcast',
                        event: 'table_offsets_state_sync',
                        payload: { paidHoursOffsets, paidRoundsOffsets, paidSessions: paidCache }
                    });
                }
            })
            .on('broadcast', { event: 'table_offsets_state_sync' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_offsets_state_sync:", payload);
                if (!payload) return;
                const { paidHoursOffsets: remoteHours, paidRoundsOffsets: remoteRounds, paidSessions: remotePaid } = payload;

                if (remoteHours) {
                    const localOffsets = { ...get().paidHoursOffsets };
                    const merged = { ...remoteHours, ...localOffsets };
                    set({ paidHoursOffsets: merged });
                    await tablesCache.setItem(scopedKey('paid_hours_offsets'), merged);
                }
                if (remoteRounds) {
                    const localRounds = { ...get().paidRoundsOffsets };
                    const merged = { ...remoteRounds, ...localRounds };
                    set({ paidRoundsOffsets: merged });
                    await tablesCache.setItem(scopedKey('paid_rounds_offsets'), merged);
                }
                if (remotePaid) {
                    const localPaid = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                    const mergedPaid = { ...remotePaid, ...localPaid };
                    await tablesCache.setItem(scopedKey('paid_sessions'), mergedPaid);
                    set(state => ({
                        activeSessions: state.activeSessions.map(s =>
                            mergedPaid[s.id] ? { ...s, paid_at: mergedPaid[s.id] } : s
                        )
                    }));
                }
            })
            .on('broadcast', { event: 'table_offsets_clear' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_offsets_clear:", payload);
                if (!payload?.sessionId) return;
                const { sessionId } = payload;

                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                delete paidCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

                const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                delete offsetCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
                set(state => {
                    const { [sessionId]: _, ...rest } = state.paidHoursOffsets;
                    return { paidHoursOffsets: rest };
                });

                const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
                delete roundsOffsetCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
                set(state => {
                    const { [sessionId]: _, ...rest } = state.paidRoundsOffsets;
                    return { paidRoundsOffsets: rest };
                });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions', filter: 'status=in.(ACTIVE,CHECKOUT)' }, (payload) => {
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
                if (status === 'SUBSCRIBED') {
                    setTimeout(() => {
                        channel.send({
                            type: 'broadcast',
                            event: 'table_pause_state_request',
                            payload: {}
                        });
                        channel.send({
                            type: 'broadcast',
                            event: 'table_offsets_state_request',
                            payload: {}
                        });
                    }, 500);
                }
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

    pauseSession: (sessionId, elapsedAtPause) => {
        set(state => ({
            pausedSessions: {
                ...state.pausedSessions,
                [sessionId]: { isPaused: true, elapsedAtPause }
            }
        }));
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_pause',
            payload: { sessionId, elapsedAtPause }
        });
    },

    resumeSession: async (sessionId) => {
        const pauseData = get().pausedSessions[sessionId];
        if (pauseData) {
            const session = get().activeSessions.find(s => s.id === sessionId);
            if (session) {
                const now = new Date();
                const startedAt = new Date(session.started_at);
                const currentElapsed = (now - startedAt) / 60000;
                const pausedMinutes = currentElapsed - pauseData.elapsedAtPause;
                const newStartedAt = new Date(startedAt.getTime() + pausedMinutes * 60000).toISOString();
                await get().updateSessionTime(sessionId, newStartedAt);
            }
        }
        set(state => {
            const { [sessionId]: _, ...rest } = state.pausedSessions;
            return { pausedSessions: rest };
        });
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_resume',
            payload: { sessionId }
        });
    },
});
