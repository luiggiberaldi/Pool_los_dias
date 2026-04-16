import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';

const getUser = () => useAuthStore.getState().currentUser;

export const createBillingActions = (set, get, tablesCache, scopedKey) => ({
    addHoursToSession: async (sessionId, additionalHours, seatId = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }

        if (seatId) {
            const newSeats = (session.seats || []).map(s =>
                s.id === seatId
                    ? { ...s, timeCharges: [...(s.timeCharges || []), { type: 'hora', amount: additionalHours, id: 'tc-' + Date.now() }] }
                    : s
            );
            const newSessions = get().activeSessions.map(s =>
                s.id === sessionId ? { ...s, seats: newSeats, paid_at: null } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            try {
                const { error } = await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
                if (error) throw error;
            } catch (e) {
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
            }
        } else {
            const newHours = Math.max(0, (Number(session.hours_paid) || 0) + additionalHours);
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
        }
    },

    resetSessionAfterPayment: async (sessionId) => {
        const paidAt = new Date().toISOString();
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
        paidCache[sessionId] = paidAt;
        await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

        const currentHours = Number(session.hours_paid) || 0;
        const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
        offsetCache[sessionId] = currentHours;
        await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
        set({ paidHoursOffsets: { ...get().paidHoursOffsets, [sessionId]: currentHours } });

        const hasPinas = session.game_mode === 'PINA' || Number(session.extended_times) > 0;
        if (hasPinas) {
            let currentRounds;
            if (session.game_mode === 'PINA') {
                currentRounds = 1 + (Number(session.extended_times) || 0);
            } else {
                currentRounds = Number(session.extended_times) || 0;
            }
            const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
            roundsOffsetCache[sessionId] = currentRounds;
            await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
            set({ paidRoundsOffsets: { ...get().paidRoundsOffsets, [sessionId]: currentRounds } });
        }

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, status: 'ACTIVE', paid_at: paidAt } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', sessionId);
            if (error) throw error;
            get().syncTablesAndSessions();
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'ACTIVE' } });
        }

        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_payment_reset',
            payload: {
                sessionId,
                paidAt,
                hoursOffset: currentHours,
                roundsOffset: hasPinas ? (session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0) : 0,
                hasPinas
            }
        });
    },

    addRoundToSession: async (sessionId, seatId = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }

        if (seatId) {
            const newSeats = (session.seats || []).map(s =>
                s.id === seatId
                    ? { ...s, timeCharges: [...(s.timeCharges || []), { type: 'pina', amount: 1, id: 'tc-' + Date.now() }] }
                    : s
            );
            const newSessions = get().activeSessions.map(s =>
                s.id === sessionId ? { ...s, seats: newSeats, paid_at: null } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            logEvent('MESAS', 'MESA_PIÑA_AGREGADA', `Mesa ${tableName} · Piña añadida a cliente`, getUser(), { sessionId, seatId });
            try {
                const { error } = await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
                if (error) throw error;
            } catch (e) {
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
            }
        } else {
            const newRounds = (Number(session.extended_times) || 0) + 1;
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
        }
    },

    addPinaToSession: async (sessionId, seatId = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        if (seatId) {
            return get().addRoundToSession(sessionId, seatId);
        }

        if (session.game_mode === 'PINA' || Number(session.extended_times) > 0) {
            return get().addRoundToSession(sessionId);
        }

        const newExtendedTimes = 1;
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, extended_times: newExtendedTimes, paid_at: null } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        logEvent('MESAS', 'MESA_PIÑA_AGREGADA', `Mesa ${tableName} · Primera piña añadida (modo mixto)`, getUser(), { sessionId });

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newExtendedTimes }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newExtendedTimes } });
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
});
