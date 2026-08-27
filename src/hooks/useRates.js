import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { useAuthStore } from './store/authStore';

const DEFAULT_RATES = {
    bcv: { price: 36.35, source: 'BCV Oficial', change: 0.05 },
    euro: { price: 39.80, source: 'Euro BCV', change: -0.02 },
    lastUpdate: new Date().toISOString()
};

const DEFAULT_EUR_USD_RATIO = 1.18;
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutos (era 30s)

const GOOGLE_SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL || '';
const NEXT_PUBLIC_BCV_API = import.meta.env.NEXT_PUBLIC_BCV_API || import.meta.env.VITE_NEXT_PUBLIC_BCV_API || '';
const BCV_TOKEN = import.meta.env.BCV_TOKEN || import.meta.env.VITE_BCV_TOKEN || '';

const getSecondaryBcvUrl = () => {
    if (!NEXT_PUBLIC_BCV_API || NEXT_PUBLIC_BCV_API.includes('TU_URL')) return '';
    const separator = NEXT_PUBLIC_BCV_API.includes('?') ? '&' : '?';
    return BCV_TOKEN ? `${NEXT_PUBLIC_BCV_API}${separator}token=${BCV_TOKEN}` : NEXT_PUBLIC_BCV_API;
};
const SECONDARY_BCV_URL = getSecondaryBcvUrl();

const RATES_DEVICE_ID = crypto.randomUUID();

export function useRates() {
    const userId = useAuthStore(s => s.cloudSession?.user?.id);
    const [rates, setRates] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
            if (saved) {
                // Migrar datos guardados: eliminar usdt si existe
                if (saved.usdt) delete saved.usdt;
                return saved;
            }
            return null;
        }
        catch { return null; }
    });

    const [loading, setLoading] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [logs, setLogs] = useState([]);

    const ratesRef = useRef(rates);
    const channelRef = useRef(null);

    useEffect(() => {
        ratesRef.current = rates;
        if (rates) localStorage.setItem('monitor_rates_v12', JSON.stringify(rates));
    }, [rates]);

    const addLog = useCallback((msg, type = 'info') => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => [...prev.slice(-49), { time, msg, type }]);
    }, []);

    const parseSafeFloat = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const clean = val.replace(/[^\d.,]/g, '');
            const lastDot = clean.lastIndexOf('.');
            const lastComma = clean.lastIndexOf(',');
            const lastSep = Math.max(lastDot, lastComma);

            if (lastSep === -1) return parseFloat(clean) || 0;

            const integer = clean.slice(0, lastSep).replace(/[.,]/g, '');
            const decimals = clean.slice(lastSep + 1);
            return parseFloat(`${integer}.${decimals}`) || 0;
        }
        return 0;
    };

    const updateData = useCallback(async (isAutoUpdate = false) => {
        if (!isAutoUpdate) setLoading(true);

        const log = (msg, type) => !isAutoUpdate && addLog(msg, type);

        log(isAutoUpdate ? "--- Auto-Update ---" : "--- Actualización Manual ---");

        const fetchGeneric = async (url, retries = 1) => {
            for (let i = 0; i <= retries; i++) {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 8000);
                try {
                    const res = await fetch(url, { signal: controller.signal });
                    clearTimeout(id);
                    if (!res.ok) {
                        if (i < retries) continue;
                        return null;
                    }
                    return await res.json();
                } catch (e) {
                    clearTimeout(id);
                    if (i < retries) {
                        await new Promise(r => setTimeout(r, 1000)); // Esperar 1 segundo antes de reintentar
                        continue;
                    }
                    return null;
                }
            }
            return null;
        };

        const getExternalRatesFallback = async () => {
            return { eur: DEFAULT_EUR_USD_RATIO, cop: null };
        };

        const getMeta = (newP, oldP, oldChange = 0, apiChange = null) => {
            let p = parseSafeFloat(newP);
            const o = parseSafeFloat(oldP);

            if (apiChange !== null && apiChange !== undefined && apiChange !== 0) {
                return { price: p, change: parseSafeFloat(apiChange) };
            }

            if (p === o) return { price: p, change: oldChange };
            return { price: p, change: (p > 0 && o > 0) ? ((p - o) / o) * 100 : 0 };
        };

        try {
            // Fetch en paralelo: datos privados (Google Script), datos secundarios (si están configurados), dolarapi fallback, y external rates (Euro, COP)
            const taskPrivate = GOOGLE_SCRIPT_URL ? fetchGeneric(GOOGLE_SCRIPT_URL) : Promise.resolve(null);
            const taskSecondary = SECONDARY_BCV_URL ? fetchGeneric(SECONDARY_BCV_URL) : Promise.resolve(null);
            const taskDolarApi = fetchGeneric('https://ve.dolarapi.com/v1/dolares');
            const taskExternal = getExternalRatesFallback();

            const [privateData, secondaryData, bcvFallbackData, externalRates] = await Promise.all([
                taskPrivate.catch(() => null),
                taskSecondary.catch(() => null),
                taskDolarApi.catch(() => null),
                taskExternal.catch(() => ({ eur: DEFAULT_EUR_USD_RATIO, cop: null }))
            ]);
            
            const euroFactor = externalRates.eur;

            if (privateData) log("✅ Datos Privados Recibidos", "success");
            if (secondaryData) log("✅ Datos de Respaldo Recibidos", "success");

            let newRates = { ...(ratesRef.current || DEFAULT_RATES) };

            let newBcvPrice = 0;
            let newEuroPrice = 0;
            let newUsdtPrice = 0;

            // Extraer USDT de privateData, secondaryData o DolarApi
            if (privateData && privateData.usdt) {
                newUsdtPrice = parseSafeFloat(typeof privateData.usdt === 'object' ? privateData.usdt.price : privateData.usdt);
            }
            if (!newUsdtPrice && secondaryData && secondaryData.usdt) {
                newUsdtPrice = parseSafeFloat(typeof secondaryData.usdt === 'object' ? secondaryData.usdt.price : secondaryData.usdt);
            }
            if (!newUsdtPrice && bcvFallbackData) {
                const usdtData = Array.isArray(bcvFallbackData) ? bcvFallbackData.find(d => d.nombre?.toLowerCase() === 'binance' || d.fuente === 'binance' || d.casa === 'binance') || bcvFallbackData.find(d => d.nombre?.toLowerCase() === 'paralelo' || d.fuente === 'paralelo' || d.casa === 'paralelo') : null;
                if (usdtData?.promedio > 0) newUsdtPrice = parseSafeFloat(usdtData.promedio);
            }

            // Procesar BCV/Euro desde datos privados (Google Script)
            // ⚠️ Validar frescura: si los datos tienen más de 24 horas, ignorarlos
            const isPrivateDataFresh = (() => {
                if (!privateData) return false;
                const rawBcv = privateData.bcv || privateData.usd;
                const lastUpdate = rawBcv?.last_update || rawBcv?.lastUpdate || privateData.lastUpdate || privateData.last_update;
                if (!lastUpdate) return true; // sin fecha, asumir fresco
                const ageMs = Date.now() - new Date(lastUpdate).getTime();
                const ageHours = ageMs / (1000 * 60 * 60);
                if (ageHours > 24) {
                    addLog(`⚠️ Google Script principal desactualizado (${Math.round(ageHours)}h atrás).`, 'warning');
                    return false;
                }
                return true;
            })();

            const isSecondaryDataFresh = (() => {
                if (!secondaryData) return false;
                const rawBcv = secondaryData.bcv || secondaryData.usd;
                const lastUpdate = rawBcv?.last_update || rawBcv?.lastUpdate || secondaryData.lastUpdate || secondaryData.last_update;
                if (!lastUpdate) return true; // sin fecha, asumir fresco
                const ageMs = Date.now() - new Date(lastUpdate).getTime();
                const ageHours = ageMs / (1000 * 60 * 60);
                if (ageHours > 24) {
                    addLog(`⚠️ Google Script respaldo desactualizado (${Math.round(ageHours)}h atrás).`, 'warning');
                    return false;
                }
                return true;
            })();

            let selectedSourceData = null;
            let sourceName = '';

            if (privateData && isPrivateDataFresh) {
                selectedSourceData = privateData;
                sourceName = 'BCV Oficial';
            } else if (secondaryData && isSecondaryDataFresh) {
                selectedSourceData = secondaryData;
                sourceName = 'BCV Oficial (Respaldo API)';
            }

            if (selectedSourceData) {
                const rawBcv = selectedSourceData.bcv || selectedSourceData.usd;
                const rawEuro = selectedSourceData.euro || selectedSourceData.eur;

                let bcvP = parseSafeFloat(typeof rawBcv === 'object' ? rawBcv.price : rawBcv);
                let euroP = parseSafeFloat(typeof rawEuro === 'object' ? rawEuro.price : rawEuro);

                let apiBcvChange = typeof rawBcv === 'object' ? rawBcv.change : null;
                let apiEuroChange = typeof rawEuro === 'object' ? rawEuro.change : null;

                // Validación de magnitud: si el precio es irrazonablemente bajo o alto, corregir
                const validateMagnitude = (val) => {
                    if (!val || val <= 0) return val;
                    // Las tasas BCV venezolanas están típicamente en un rango razonable.
                    // Si el valor es extremadamente alto (por ejemplo, remanente de reconversión anterior, > 20000), normalizar.
                    if (val < 1) {
                        while (val < 10) val *= 10;
                    } else if (val > 20000) {
                        while (val > 2000) val /= 10;
                    }
                    return val;
                };

                newBcvPrice = validateMagnitude(bcvP);
                newEuroPrice = validateMagnitude(euroP);

                if (newBcvPrice > 0) {
                    const meta = getMeta(newBcvPrice, newRates.bcv.price, newRates.bcv.change, apiBcvChange);
                    newRates.bcv = { ...newRates.bcv, ...meta, source: sourceName };
                }
                if (newEuroPrice > 0) {
                    const meta = getMeta(newEuroPrice, newRates.euro.price, newRates.euro.change, apiEuroChange);
                    newRates.euro = { ...newRates.euro, ...meta, source: sourceName === 'BCV Oficial' ? 'Euro BCV' : 'Euro BCV (Respaldo API)' };
                }

            } else if (bcvFallbackData) {
                // Fallback: DolarApi
                const oficial = Array.isArray(bcvFallbackData) ? bcvFallbackData.find(d => d.fuente === 'oficial' || d.nombre === 'Oficial') : null;

                if (oficial?.promedio > 0) {
                    let bcvP = parseSafeFloat(oficial.promedio);
                    newBcvPrice = bcvP;
                    const meta = getMeta(newBcvPrice, newRates.bcv.price, newRates.bcv.change);
                    newRates.bcv = { ...newRates.bcv, ...meta, source: 'BCV Oficial (Respaldo)' };

                    if (euroFactor) {
                        newEuroPrice = newBcvPrice * euroFactor;
                        const metaEur = getMeta(newEuroPrice, newRates.euro.price, newRates.euro.change);
                        newRates.euro = { ...newRates.euro, ...metaEur, source: 'Euro BCV (Triangulado)' };
                    }
                }
            }

            // Integrar cálculo AutoCOP con TRM y USDT
            if (externalRates.cop > 0) {
                // El usuario espera que 1 USD del sistema equivalga a 1 USDT real en COP (~TRM / Binance P2P)
                let calcCop = externalRates.cop;
                newRates.autoCopRate = { 
                    price: calcCop, 
                    source: 'Binance USDT / TRM', 
                    rawTrm: externalRates.cop, 
                    rawUsdt: newUsdtPrice 
                };
            }

            newRates.lastUpdate = new Date();
            setRates(newRates);
            // Broadcast a otros dispositivos
            channelRef.current?.send({
                type: 'broadcast',
                event: 'rate_data',
                payload: { senderId: RATES_DEVICE_ID, rates: newRates }
            }).catch(() => {});
            if (!isAutoUpdate) addLog("Actualización completada", 'success');

        } catch (e) {
            console.error(e);
            log("Error actualización", 'error');
            setIsOffline(true);
        } finally {
            setLoading(false);
        }
    }, [addLog]);

    useEffect(() => {
        updateData(false);
        const intervalId = setInterval(() => { updateData(true); }, UPDATE_INTERVAL);

        // Nunca abrir canales sin tenant: un canal sin UUID permite escuchar broadcasts ajenos.
        if (!userId) return () => clearInterval(intervalId);
        const channel = supabaseCloud.channel(`rate_data_sync:${userId}`);
        channel.on('broadcast', { event: 'rate_data' }, ({ payload }) => {
            if (!payload || payload.senderId === RATES_DEVICE_ID) return;
            if (payload.rates) {
                console.log('[RateSync] Tasa recibida de otro dispositivo');
                setRates(payload.rates);
            }
        });
        channel.subscribe();
        channelRef.current = channel;

        return () => {
            clearInterval(intervalId);
            supabaseCloud.removeChannel(channel);
        };
    }, [updateData, userId]);

    const currentRates = rates || DEFAULT_RATES;
    return { rates: currentRates, loading, isOffline, logs, updateData };
}
