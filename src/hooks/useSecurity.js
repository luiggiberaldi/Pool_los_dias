import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { supabaseCloud as supabase } from '../config/supabaseCloud';

const APP_VERSION = '1.0.0';
const DEMO_DURATION_MS = 168 * 60 * 60 * 1000; // 168 horas (7 días)

// FIX 2: Ofuscación XOR + btoa para tokens en localStorage
// WARNING: This is basic obfuscation to prevent casual tampering by employees.
// It is NOT cryptographically secure from a determined attacker.
const XOR_KEY = 'PDA_SEC_2026';

const encodeToken = (str) => {
    try {
        const xored = str.split('').map((c, i) =>
            String.fromCharCode(
                c.charCodeAt(0) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length)
            )
        ).join('');
        return btoa(unescape(encodeURIComponent(xored)));
    } catch { return str; }
};

const decodeToken = (encoded) => {
    try {
        const xored = decodeURIComponent(escape(atob(encoded)));
        return xored.split('').map((c, i) =>
            String.fromCharCode(
                c.charCodeAt(0) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length)
            )
        ).join('');
    } catch { return encoded; }
};



export function useSecurity() {
    const [deviceId, setDeviceId] = useState('');
    const [isPremium, setIsPremium] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isDemo, setIsDemo] = useState(false);
    const [demoExpires, setDemoExpires] = useState(null);
    const [demoExpiredMsg, setDemoExpiredMsg] = useState('');
    const [demoTimeLeft, setDemoTimeLeft] = useState('');
    // FIX 3: demoUsed como estado, leído desde IndexedDB
    const [demoUsed, setDemoUsed] = useState(false);

    // Calcular tiempo restante formateado
    const updateTimeLeft = useCallback((expiresAt) => {
        if (!expiresAt) { setDemoTimeLeft(''); return; }
        const diff = expiresAt - Date.now();
        if (diff <= 0) { setDemoTimeLeft(''); return; }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) setDemoTimeLeft(`${days}d ${hours}h`);
        else if (hours > 0) setDemoTimeLeft(`${hours}h ${mins}m`);
        else setDemoTimeLeft(`${mins}m`);
    }, []);

    useEffect(() => {
        // 1. Obtener o Generar Device ID a través de fingerprinting
        const generateFingerprint = async () => {
            const nav = window.navigator;
            const screen = window.screen;

            const components = [
                nav.userAgent,
                nav.language,
                nav.hardwareConcurrency || 1,
                nav.deviceMemory || 1,
                screen.width,
                screen.height,
                screen.colorDepth,
                new Date().getTimezoneOffset()
            ].join('|');

            if (!window.crypto || !window.crypto.subtle) {
                // Fallback (solo en http sin SSL)
                let hash = 0;
                for (let i = 0; i < components.length; i++) {
                    hash = ((hash << 5) - hash) + components.charCodeAt(i);
                    hash |= 0;
                }
                const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
                return `PDA-${hex}`;
            }

            // Mismo hardware = mismo hash SHA-256
            const encoder = new TextEncoder();
            const data = encoder.encode(components);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().substring(0, 8);
            return `PDA-${hex}`;
        };

        const initDeviceId = async () => {
            let storedId = localStorage.getItem('pda_device_id');
            if (!storedId) {
                storedId = await generateFingerprint();
                localStorage.setItem('pda_device_id', storedId);
            }
            setDeviceId(storedId);

            // Auto-registro: Desactivado. Migrado a CloudAuthModal y useCloudAuthLogic.

            // eslint-disable-next-line react-hooks/immutability
            checkLicense(storedId);
        };

        initDeviceId();

        // FIX 3: Leer demo flag desde IndexedDB
        storageService.getItem('pda_demo_flag_v1', null).then(r => {
            if (r?.used) setDemoUsed(true);
        });
    }, []);

    // La verificación de licencia legacy se desactivó: la tabla `licenses` fue
    // retirada del contrato actual. La licencia cloud se valida en useAppInit.


    // Countdown timer para demo
    useEffect(() => {
        if (!isDemo || !demoExpires) return;
        updateTimeLeft(demoExpires);
        const interval = setInterval(() => {
            const diff = demoExpires - Date.now();
            if (diff <= 0) {
                // Demo expiró en tiempo real
                clearInterval(interval);
                localStorage.removeItem('pda_premium_token');
                setIsPremium(false);
                setIsDemo(false);
                setDemoTimeLeft('');
                setDemoExpiredMsg("Tu licencia temporal ha finalizado. Esperamos que hayas disfrutado la experiencia completa.");
            } else {
                updateTimeLeft(demoExpires);
            }
        }, 60000); // Cada minuto
        return () => clearInterval(interval);
    }, [isDemo, demoExpires, updateTimeLeft]);

    // FIX 4: Integrity check periódico cada 30 minutos
    useEffect(() => {
        if (!deviceId) return;
        const interval = setInterval(async () => {
            const raw = localStorage.getItem('pda_premium_token');

            // Si localStorage fue borrado, intentar restaurar desde servidor
            if (!raw) {
                // No consultar `licenses`: es una tabla legacy no expuesta en el
                // contrato actual. La sesión cloud controla el acceso vigente.
                if (isPremium) {
                    setIsPremium(false);
                    setIsDemo(false);
                    window.location.reload();
                }
                return;
            }

            // Verificar integridad del token almacenado
            if (raw) {
                try {
                    const token = decodeToken(raw);
                    const obj = JSON.parse(token);
                    // Si es demo y ya expiró
                    if (obj?.type === 'demo7' && obj?.expires && Date.now() >= obj.expires) {
                        localStorage.removeItem('pda_premium_token');
                        setIsPremium(false);
                        setIsDemo(false);
                        window.location.reload();
                    }
                } catch {
                    // Token corrupto → verificar contra servidor
                    if (isPremium) {
                        localStorage.removeItem('pda_premium_token');
                        setIsPremium(false);
                        setIsDemo(false);
                        window.location.reload();
                    }
                }
            }
        }, 30 * 60 * 1000); // 30 minutos

        return () => clearInterval(interval);
    }, [deviceId, isPremium]);

    const checkLicense = async (currentDeviceId) => {
        // FIX 2: Decodificar token ofuscado
        const rawStored = localStorage.getItem('pda_premium_token');
        const storedToken = rawStored ? decodeToken(rawStored) : null;

        if (!storedToken) {
            // La tabla legacy `licenses` no forma parte del contrato vigente.
            // Sin token local, el módulo cloud controla la sesión por separado.
            setIsPremium(false);
            setLoading(false);
            return;
        }

        let isPremiumConfirmed = false;
        let confirmedDemo = false;
        let confirmedExpires = null;

        try {
            const tokenObj = JSON.parse(storedToken);
            if (tokenObj && tokenObj.deviceId === currentDeviceId) {
                // Token belongs to this device
                const isTimeLimited = tokenObj.type === 'demo7' || tokenObj.isDemo; // retrocompatibilidad
                // Verificar estado remoto: Desactivado. 
                // Ahora confiamos exclusivamente en el token local para el modo legado.
                // La lógica en la nube está gestionada por useCloudAuthLogic.
                let revokedRemotely = false;

                if (revokedRemotely) {
                    localStorage.removeItem('pda_premium_token');
                    setIsPremium(false);
                    setIsDemo(false);
                    setDemoExpiredMsg("Tu licencia ha sido desactivada por el administrador.");
                    setLoading(false);
                    return;
                }

                if (isTimeLimited) {
                    if (Date.now() < tokenObj.expires) {
                        setIsPremium(true);
                        setIsDemo(true);
                        setDemoExpires(tokenObj.expires);
                        isPremiumConfirmed = true;
                        confirmedDemo = true;
                        confirmedExpires = tokenObj.expires;
                    } else {
                        console.warn("Demo Expirada");
                        localStorage.removeItem('pda_premium_token');
                        setIsPremium(false);
                        setIsDemo(false);
                        setDemoExpiredMsg("Tu licencia temporal ha finalizado. Esperamos que hayas disfrutado la experiencia completa.");
                    }
                } else {
                    // Permanente
                    setIsPremium(true);
                    setIsDemo(false);
                    isPremiumConfirmed = true;
                }
            } else {
                setIsPremium(false);
            }
        } catch (e) {
            // Unparseable token or old string format (Lifetime License legacy)
            setIsPremium(false);
        }

        // FIX 5: Guardar backup en sessionStorage si licencia válida
        if (isPremiumConfirmed) {
            try {
                sessionStorage.setItem(
                    '_pda_s',
                    encodeToken('VALID_SESSION:' + currentDeviceId)
                );
            } catch { /* ignore */ }
        }

        // La licencia legacy local no crea ni modifica registros cloud.
        // El acceso cloud y el límite de dispositivos se validan en useAppInit.
        setLoading(false);
    };

    /**
     * Activa la demo de 7 días sin necesidad de código.
     * Solo puede usarse UNA VEZ por dispositivo.
     */
    const activateDemo = async () => {
        // FIX 3: Verificar demo en IndexedDB (local)
        const demoRecord = await storageService.getItem('pda_demo_flag_v1', null);
        if (demoRecord?.used) {
            return { success: false, status: 'DEMO_USED' };
        }

        const currentDeviceId = deviceId || localStorage.getItem('pda_device_id');

        const expires = Date.now() + DEMO_DURATION_MS;
        const demoToken = {
            deviceId: currentDeviceId,
            type: 'demo7',
            expires: expires,
        };

        // FIX 2: Guardar token ofuscado
        localStorage.setItem('pda_premium_token', encodeToken(JSON.stringify(demoToken)));

        // FIX 3: Guardar flag en IndexedDB
        await storageService.setItem('pda_demo_flag_v1', {
            used: true,
            ts: Date.now(),
            deviceId: currentDeviceId,
        });

        setIsPremium(true);
        setIsDemo(true);
        setDemoExpires(expires);
        setDemoUsed(true);

        // La demo legacy queda local y no usa RPCs inexistentes ni concede
        // privilegios cloud. El acceso cloud requiere sesión Supabase válida.
        return { success: true, status: 'DEMO_ACTIVATED' };
    };

    /**
     * Desbloquea con código de activación.
     * Consulta Supabase para determinar si es permanente o temporal (7/30 días).
     */
    const unlockApp = async (inputCode) => {
        try {
            const cleanCode = (inputCode || '').trim().toUpperCase().replace(/O/g, '0');
            // La activación legacy no está disponible en el contrato cloud actual.
            // Se evita consultar la tabla retirada `licenses` (401/unauthorized).
            if (!cleanCode) return { success: false, status: 'INVALID_CODE' };
            return { success: false, status: 'LEGACY_LICENSE_UNAVAILABLE' };
            
        } catch (err) {
            console.error('Error validating license:', err);
            return { success: false, status: 'SERVER_ERROR' };
        }
    };

    const generateCodeForClient = async () => null;

    /**
     * Fuerza un heartbeat manual para sincronizar cambios como el nombre del negocio de inmediato.
     */
    const forceHeartbeat = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.email) return false;
            const { data, error } = await supabase.rpc('register_and_check_device', {
                p_email: session.user.email,
                p_device_id: deviceId || localStorage.getItem('pda_device_id') || 'UNKNOWN',
                p_device_alias: localStorage.getItem('pda_device_alias') || 'Dispositivo'
            });
            if (error) throw error;
            return data === 'ok';
        } catch (e) {
            console.error('Error forcing device heartbeat:', e);
            return false;
        }
    };

    return {
        deviceId,
        isPremium,
        loading,
        unlockApp,
        activateDemo,
        generateCodeForClient,
        isDemo,
        demoExpires,
        demoTimeLeft,
        demoExpiredMsg,
        dismissExpiredMsg: () => setDemoExpiredMsg(''),
        // FIX 3: demoUsed desde estado (IndexedDB)
        demoUsed,
        forceHeartbeat,
    };
}
