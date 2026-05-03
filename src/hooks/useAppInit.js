import { useState, useEffect } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { useAuthStore } from './store/authStore';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useCashStore } from './store/cashStore';

export function useAppInit() {
    const [cloudSession, setCloudSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);

    const clearUsersCache = useAuthStore(s => s.clearUsersCache);
    const setCloudEmail = useAuthStore(s => s.setCloudEmail);

    // ── Suscripción Realtime Global ──
    const subscribeToTablesRealtime = useTablesStore(s => s.subscribeToRealtime);
    const subscribeToOrdersRealtime = useOrdersStore(s => s.subscribeToRealtime);
    const unsubscribeFromTablesRealtime = useTablesStore(s => s.unsubscribeFromRealtime);
    const unsubscribeFromOrdersRealtime = useOrdersStore(s => s.unsubscribeFromRealtime);
    const syncTablesAndSessionsGlobal = useTablesStore(s => s.syncTablesAndSessions);

    useEffect(() => {
        if (!cloudSession) return;
        syncTablesAndSessionsGlobal();
        subscribeToTablesRealtime();
        subscribeToOrdersRealtime();
        return () => {
            unsubscribeFromTablesRealtime();
            unsubscribeFromOrdersRealtime();
        };
    }, [cloudSession, syncTablesAndSessionsGlobal, subscribeToTablesRealtime, subscribeToOrdersRealtime, unsubscribeFromTablesRealtime, unsubscribeFromOrdersRealtime]);

    // ── Sesión Supabase + límite de dispositivos vía RPC ──
    useEffect(() => {
        let mounted = true;

        const applySession = async (session) => {
            if (!mounted) return;

            if (!session?.user?.email) {
                setCloudEmail(null);
                if (!navigator.onLine) {
                    try {
                        const { default: lf } = await import('localforage');
                        const email = localStorage.getItem('poolbar_cloud_email') || '';
                        const cacheKey = email ? `poolbar_users_cache_${email}` : 'poolbar_users_cache';
                        const users = await lf.getItem(cacheKey);
                        if (Array.isArray(users) && users.length > 0) {
                            setCloudSession({ offline: true });
                            setCheckingSession(false);
                            return;
                        }
                    } catch { /* sin caché → pide login */ }
                }
                setCloudSession(null);
                setCheckingSession(false);
                return;
            }

            const email = session.user.email.toLowerCase();
            setCloudEmail(email);

            useCashStore.getState().init();
            useTablesStore.getState().init();
            useOrdersStore.getState().init();
            const deviceId = localStorage.getItem('pda_device_id') || 'UNKNOWN';

            try {
                const savedAlias = localStorage.getItem('pda_device_alias');
                const defaultAlias = `Dispositivo ${navigator.platform || 'Web'}`;
                const finalAlias = savedAlias && savedAlias.trim() !== '' ? savedAlias.trim() : defaultAlias;

                const isExplicitLogin = localStorage.getItem('pda_explicit_login') === 'true';

                if (!isExplicitLogin) {
                    const { data: existingDevice, error: selectErr } = await supabaseCloud
                       .from('account_devices')
                       .select('id')
                       .eq('device_id', deviceId)
                       .eq('email', email)
                       .maybeSingle();

                    if (!selectErr && existingDevice === null) {
                        await supabaseCloud.auth.signOut();
                        if (mounted) { setCloudSession(null); setCheckingSession(false); }
                        return;
                    }
                } else {
                    localStorage.removeItem('pda_explicit_login');
                }

                const { data: result, error } = await supabaseCloud.rpc('register_and_check_device', {
                    p_email: email,
                    p_device_id: deviceId,
                    p_device_alias: finalAlias,
                });

                if (!error) {
                    if (result === 'license_inactive' || result === 'license_expired') {
                        await supabaseCloud.auth.signOut();
                        if (mounted) { setCloudSession(null); setCheckingSession(false); }
                        return;
                    }
                }
            } catch {
                // Sin conexión o RPC pendiente — dejar pasar
            }

            if (mounted) {
                localStorage.setItem('pool_had_cloud_session', 'true');
                setCloudSession(session);
                setCheckingSession(false);
            }
        };

        supabaseCloud.auth.getSession().then(({ data: { session } }) => {
            applySession(session);
        });

        const { data: { subscription } } = supabaseCloud.auth.onAuthStateChange((event, session) => {
            if (!mounted) return;
            if (event === 'PASSWORD_RECOVERY') {
                setShowPasswordRecovery(true);
                setCheckingSession(false);
            } else if (event === 'SIGNED_IN') applySession(session);
            else if (event === 'SIGNED_OUT') {
                clearUsersCache();
                if (navigator.onLine) {
                    localStorage.removeItem('pool_had_cloud_session');
                    setCloudSession(null);
                    setCheckingSession(false);
                } else {
                    applySession(null);
                }
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return {
        cloudSession,
        checkingSession,
        showPasswordRecovery,
        setShowPasswordRecovery,
        setCloudSession,
    };
}
