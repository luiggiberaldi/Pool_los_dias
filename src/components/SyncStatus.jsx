import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, CloudDownload, CheckCircle2 } from 'lucide-react';
import { supabaseCloud as supabase } from '../config/supabaseCloud';
import { pullLatestFromCloud } from '../hooks/useCloudSync';
import { offlineQueueService } from '../services/offlineQueueService';
import localforage from 'localforage';

/**
 * SyncStatus — Indicador visual de conectividad + botón de sincronización forzada.
 * Clicando el botón:
 *  - Si hay ventas offline pendientes → las sube a Supabase
 *  - Siempre hace un pull del inventario más reciente desde la nube
 *  - Muestra el tiempo desde la última sincronización exitosa
 */
export default function SyncStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState(() => {
        const saved = localStorage.getItem('_poolbar_last_synced');
        return saved ? parseInt(saved, 10) : null;
    });
    const [justSynced, setJustSynced] = useState(false);

    const checkQueue = useCallback(async () => {
        try {
            const queue = await localforage.getItem('offline_sales_queue') || [];
            const pending = queue.filter(q => q.sync_status === 'pending');
            setPendingCount(pending.length);
        } catch(err) { /* silent */ }
    }, []);

    const checkHealth = useCallback(async () => {
        if (!navigator.onLine) { setIsOnline(false); return; }
        try {
            const pingPromise = supabase.from('sync_documents').select('id').limit(1);
            const timeout = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000));
            const result = await Promise.race([pingPromise, timeout]);
            setIsOnline(!result.error);
        } catch { setIsOnline(false); }
    }, []);

    // Botón de sincronización forzada
    const handleForceSync = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setJustSynced(false);
        let syncSuccess = false;
        try {
            await checkHealth();
            if (!navigator.onLine) return;

            // 1. Subir ventas offline pendientes
            const result = await offlineQueueService.syncPendingSales();

            // 2. Jalar el inventario más reciente de la nube
            await pullLatestFromCloud();

            // 3. Solo marcar como sincronizado si no quedaron pendientes
            const hasRemaining = result?.pending > 0;
            if (!hasRemaining) {
                const now = Date.now();
                setLastSyncedAt(now);
                localStorage.setItem('_poolbar_last_synced', now.toString());
                syncSuccess = true;
            }

            await checkQueue();
        } catch (e) {
            console.warn('[SyncStatus] Error en force sync:', e);
        } finally {
            setIsSyncing(false);
            if (syncSuccess) {
                setJustSynced(true);
                setTimeout(() => setJustSynced(false), 3000);
            }
        }
    }, [isSyncing, checkHealth, checkQueue]);

    // Auto-sync: cuando hay pendientes y hay internet, sincronizar sin que el usuario haga nada
    useEffect(() => {
        if (pendingCount > 0 && isOnline && !isSyncing) {
            const timer = setTimeout(() => handleForceSync(), 2500);
            return () => clearTimeout(timer);
        }
    }, [pendingCount, isOnline, isSyncing, handleForceSync]);

    useEffect(() => {
        const goOnline = () => { setIsOnline(true); checkHealth(); checkQueue(); };
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        checkHealth();
        checkQueue();

        const healthInterval = setInterval(checkHealth, 5 * 60 * 1000); // 5 min (era 60s)
        const queueInterval = setInterval(checkQueue, 30 * 1000); // 30s (era 4s, es local)

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            clearInterval(healthInterval);
            clearInterval(queueInterval);
        };
    }, [checkHealth, checkQueue]);

    // Formato de tiempo corto
    const getTimeSince = (ts) => {
        if (!ts) return null;
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 10) return 'ahora';
        if (diff < 60) return `${diff}s`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        return `${Math.floor(diff / 3600)}h`;
    };

    // Estado visual
    const hasPendingSales = pendingCount > 0;
    let statusType = 'online';
    if (!isOnline) statusType = 'offline';
    else if (isSyncing) statusType = 'syncing';
    else if (justSynced) statusType = 'done';
    else if (hasPendingSales) statusType = 'pending';

    const styles = {
        online:  'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 focus:ring-emerald-500',
        done:    'bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200 focus:ring-emerald-500',
        syncing: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 focus:ring-sky-500',
        pending: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 focus:ring-amber-500',
        offline: 'bg-rose-50 border-rose-200 text-rose-600 focus:ring-rose-500 animate-pulse',
    };

    const timeSince = getTimeSince(lastSyncedAt);

    const tooltips = {
        online: timeSince ? `Última sincronización: hace ${timeSince}. Clic para sincronizar ahora.` : 'Conectado. Clic para sincronizar inventario.',
        done: 'Inventario sincronizado correctamente.',
        syncing: 'Sincronizando inventario con la nube...',
        pending: `${pendingCount} venta(s) pendiente(s) por subir. Clic para sincronizar.`,
        offline: 'Sin conexión al servidor. Comprueba tu internet.',
    };

    return (
        <button
            onClick={handleForceSync}
            disabled={!isOnline || isSyncing}
            title={tooltips[statusType]}
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wider transition-all duration-300 shadow-sm border focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed ${styles[statusType]}`}
        >
            {statusType === 'online' && (
                <>
                    <Wifi size={13} strokeWidth={2.5} />
                    <span className="hidden sm:inline">
                        {timeSince ? `Sync ${timeSince}` : 'Online'}
                    </span>
                </>
            )}
            {statusType === 'done' && (
                <>
                    <CheckCircle2 size={13} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Listo</span>
                </>
            )}
            {statusType === 'syncing' && (
                <>
                    <RefreshCw size={13} strokeWidth={2.5} className="animate-spin" />
                    <span className="hidden sm:inline">Sincronizando...</span>
                </>
            )}
            {statusType === 'pending' && (
                <>
                    <CloudDownload size={13} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Subir ({pendingCount})</span>
                    <span className="sm:hidden">{pendingCount}</span>
                </>
            )}
            {statusType === 'offline' && (
                <>
                    <WifiOff size={13} strokeWidth={2.5} />
                    <span>Offline</span>
                </>
            )}
        </button>
    );
}
