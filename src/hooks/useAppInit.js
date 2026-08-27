import { useState, useEffect } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { useAuthStore } from './store/authStore';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useCashStore } from './store/cashStore';

export function useAppInit() {
    const [cloudSession, setCloudSessionState] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
    
    // Control de Versiones
    const CURRENT_APP_VERSION = 2; // Incrementar este número para forzar actualización
    const [isVersionObsolete, setIsVersionObsolete] = useState(false);
    const [requiredVersion, setRequiredVersion] = useState(null);

    const clearUsersCache = useAuthStore(s => s.clearUsersCache);
    const setCloudEmail = useAuthStore(s => s.setCloudEmail);
    const setStoreCloudSession = useAuthStore(s => s.setCloudSession);

    const setCloudSession = (session) => {
        setCloudSessionState(session);
        setStoreCloudSession(session);
    };

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

            // 1. Check de versión global antes de inicializar nada
            try {
                const { data: versionData } = await supabaseCloud
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'min_app_version')
                    .single();
                
                if (versionData && versionData.value) {
                    const reqVersion = parseInt(versionData.value, 10);
                    if (CURRENT_APP_VERSION < reqVersion) {
                        setRequiredVersion(reqVersion);
                        setIsVersionObsolete(true);
                        setCheckingSession(false);
                        return; // Abortar inicio si la versión es obsoleta
                    }
                }
            } catch (e) {
                console.warn('[AppInit] Error al chequear versión de la app:', e);
                // Si falla (ej. sin internet), continuamos con la ejecución normal
            }

            if (!session?.user?.email) {
                if (!navigator.onLine) {
                    try {
                        const { default: lf } = await import('localforage');
                        const cachedEmail = localStorage.getItem('poolbar_cloud_email') || '';
                        const cacheKey = cachedEmail ? `poolbar_users_cache_${cachedEmail}` : 'poolbar_users_cache';
                        const users = await lf.getItem(cacheKey);
                        if (cachedEmail && Array.isArray(users) && users.length > 0) {
                            setCloudEmail(cachedEmail);
                            setCloudSession({ offline: true });
                            setCheckingSession(false);
                            return;
                        }
                    } catch { /* sin caché → pide login */ }
                }
                setCloudEmail(null);
                setCloudSession(null);
                setCheckingSession(false);
                return;
            }

            const email = session.user.email.toLowerCase();
            setCloudEmail(email);

            const deviceId = localStorage.getItem('pda_device_id') || 'UNKNOWN';

            try {
                const savedAlias = localStorage.getItem('pda_device_alias');
                const defaultAlias = `Dispositivo ${navigator.platform || 'Web'}`;
                const finalAlias = savedAlias && savedAlias.trim() !== '' ? savedAlias.trim() : defaultAlias;

                const { data: result, error } = await supabaseCloud.rpc('register_and_check_device', {
                    p_email: email,
                    p_device_id: deviceId,
                    p_device_alias: finalAlias,
                });

                if (error) {
                    if (error.code === '42501' || /401|permission denied|unauthori[sz]ed/i.test(error.message || '')) {
                        await supabaseCloud.auth.signOut().catch(() => {});
                        if (mounted) {
                            setCloudSession(null);
                            setCheckingSession(false);
                        }
                        return;
                    }
                    if (!navigator.onLine) {
                        setCloudSession({ offline: true });
                        setCheckingSession(false);
                        return;
                    }
                    throw error;
                }
                if (result === 'license_inactive' || result === 'license_expired') {
                    await supabaseCloud.auth.signOut().catch(() => {});
                    if (mounted) { setCloudSession(null); setCheckingSession(false); }
                    return;
                }
                if (result === 'limit_reached') {
                    // Mantener la sesión: CloudAuthModal necesita el JWT para listar/expulsar dispositivos.
                    if (mounted) { setCloudSession(session); setCheckingSession(false); }
                    return;
                }
            } catch (error) {
                console.error('[AppInit] Validación de cuenta/dispositivo falló:', error);
                if (navigator.onLine) {
                    await supabaseCloud.auth.signOut();
                    if (mounted) { setCloudSession(null); setCheckingSession(false); }
                    return;
                }
                setCloudSession({ offline: true });
                setCheckingSession(false);
                return;
            }

            useCashStore.getState().init();
            useTablesStore.getState().init();
            useOrdersStore.getState().init();

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

        return () => { mounted = false; subscription.unsubscribe(); };
    }, [setCloudEmail, setStoreCloudSession]);

    return {
        cloudSession,
        checkingSession,
        showPasswordRecovery,
        setShowPasswordRecovery,
        setCloudSession,
        isVersionObsolete,
        currentVersion: CURRENT_APP_VERSION,
        requiredVersion
    };
}
