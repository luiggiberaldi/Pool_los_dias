import { useEffect, useRef } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { storageService } from '../utils/storageService';
import { useAuthStore } from './store/useAuthStore';

const SYNC_KEYS = [
    'bodega_products_v1',
    'bodega_customers_v1',
    'bodega_sales_v1',
    'bodega_payment_methods_v1',
    'monitor_rates_v12',
    'bodega_accounts_v2',
    'abasto_audit_log_v1',
    'abasto-auth-storage',
    'bodega_custom_rate',
    'bodega_use_auto_rate',
    'tasa_cop',
    'cop_enabled',
    'auto_cop_enabled',
    'poolbar_categories_v1'
];

const LOCAL_KEYS = [
    'abasto-auth-storage',
    'bodega_custom_rate',
    'bodega_use_auto_rate',
    'tasa_cop',
    'cop_enabled',
    'auto_cop_enabled'
];

// ─── Estado Global del Motor ───────────────────────────────────────────────
let globalSubscription = null;
let isSyncingFromCloud = false; 
let isInitialSyncCompleted = false; // BLOQUEO DE ARRANQUE: No subir nada hasta descargar
let pendingPush = {};           

const IMPORT_GUARD_KEY = '_poolbar_import_guard';
const SYNC_QUEUE_KEY = '_poolbar_sync_queue'; // Cola persistente para offline

export const setImportGuard = () => sessionStorage.setItem(IMPORT_GUARD_KEY, '1');
export const clearImportGuard = () => sessionStorage.removeItem(IMPORT_GUARD_KEY);
const hasImportGuard = () => sessionStorage.getItem(IMPORT_GUARD_KEY) === '1';

// Gestión de Cola Offline
const getSyncQueue = () => {
    try {
        return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    } catch(e) { return []; }
};
const addToSyncQueue = (key) => {
    const queue = getSyncQueue();
    if (!queue.includes(key)) {
        queue.push(key);
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
};
const removeFromSyncQueue = (key) => {
    const queue = getSyncQueue().filter(k => k !== key);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
};

/**
 * Procesa todos los cambios pendientes que se hicieron offline o durante el arranque.
 */
export const processSyncQueue = async () => {
    if (!isInitialSyncCompleted) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    console.log(`[CloudSync] Procesando cola de pendientes: ${queue.length} items`);
    for (const key of queue) {
        try {
            let value;
            if (LOCAL_KEYS.includes(key)) {
                value = localStorage.getItem(key);
                try { value = JSON.parse(value); } catch(e) {}
            } else {
                value = await storageService.getItem(key);
            }
            
            if (value !== null) {
                // Forzamos la subida saltando el guardia de inicialización
                await pushCloudSync(key, value, true);
            }
            removeFromSyncQueue(key);
        } catch (e) {
            console.warn(`[CloudSync] Reintento fallido para ${key}:`, e.message);
            break; // Detener si falla la red de nuevo
        }
    }
};

// Escuchar retorno de internet
if (typeof window !== 'undefined') {
    window.addEventListener('online', processSyncQueue);
}

// Interceptor de localStorage 
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (!isSyncingFromCloud && LOCAL_KEYS.includes(key)) {
        _debouncePush(key, value);
    }
};

function _debouncePush(key, value) {
    if (pendingPush[key]) clearTimeout(pendingPush[key]);
    pendingPush[key] = setTimeout(() => {
        delete pendingPush[key];
        pushCloudSync(key, value).catch(() => {});
    }, 500);
}

/**
 * Empuja cambios a la nube.
 */
export const pushCloudSync = async (key, value, force = false) => {
    if (isSyncingFromCloud) return;
    if (!SYNC_KEYS.includes(key)) return;

    // Si aún no hemos terminado el pull inicial, encolamos en lugar de subir
    // para evitar pisar datos nuevos de la nube con datos locales viejos.
    if (!isInitialSyncCompleted && !force) {
        console.log(`[CloudSync] Encolado por fase de arranque: ${key}`);
        addToSyncQueue(key);
        return;
    }

    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) {
            addToSyncQueue(key);
            return;
        };

        const collectionType = LOCAL_KEYS.includes(key) ? 'local' : 'store';

        const { error } = await supabaseCloud.from('sync_documents').upsert({
            user_id: session.user.id,
            collection: collectionType,
            doc_id: key,
            data: { payload: value },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,collection,doc_id' });

        if (error) throw error;
        removeFromSyncQueue(key);

    } catch (e) {
        console.warn('[CloudSync] Falló envío. Encolado para reintento:', key);
        addToSyncQueue(key);
    }
};

async function _applyFromCloud(docId, collection, payload) {
    isSyncingFromCloud = true;
    try {
        if (collection === 'local') {
            const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
            originalSetItem(docId, stringPayload);
            window.dispatchEvent(new StorageEvent('storage', {
                key: docId,
                newValue: stringPayload,
                storageArea: localStorage
            }));
            if (docId === 'abasto-auth-storage') {
                useAuthStore.persist.rehydrate();
            }
        } else {
            const { default: localforage } = await import('localforage');
            localforage.config({ name: 'BodegaApp', storeName: 'bodega_app_data' });
            await localforage.setItem(docId, payload);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: docId } }));
        }
    } finally {
        isSyncingFromCloud = false;
    }
}

export function useCloudSync() {
    const adminEmail = useAuthStore(s => s.adminEmail);
    const adminPassword = useAuthStore(s => s.adminPassword);
    const isCloudConfigured = Boolean(adminEmail && adminPassword);
    const isInitialized = useRef(false);

    useEffect(() => {
        if (!isCloudConfigured) {
            if (globalSubscription) {
                globalSubscription.unsubscribe();
                globalSubscription = null;
                isInitialized.current = false;
            }
            return;
        }

        if (isInitialized.current) return;

        const initSync = async () => {
            try {
                let session = (await supabaseCloud.auth.getSession()).data.session;
                if (!session?.user?.id) return;

                isInitialized.current = true;
                const userId = session.user.id;

                // ── Pull Inicial ───────────────────────────────────────────
                if (hasImportGuard()) {
                    console.log('[CloudSync] Guard activo — pull inicial omitido.');
                    clearImportGuard();
                    isInitialSyncCompleted = true; // El import ya es la verdad
                } else {
                    const { data: docs } = await supabaseCloud
                        .from('sync_documents')
                        .select('collection, doc_id, data')
                        .eq('user_id', userId)
                        .in('collection', ['store', 'local']);

                    if (docs?.length > 0) {
                        for (const doc of docs) {
                            // Solo aplicamos de nube si NO tenemos cambios locales pendientes para esa llave
                            // Esto protege cambios hechos offline justo antes de abrir la app.
                            const queue = getSyncQueue();
                            if (!queue.includes(doc.doc_id)) {
                                await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
                            } else {
                                console.log(`[CloudSync] Saltando pull para ${doc.doc_id} por discrepancia local pendiente.`);
                            }
                        }
                        console.log(`[CloudSync] Pull inicial: ${docs.length} documentos procesados.`);
                    }
                    isInitialSyncCompleted = true;
                }

                // Procesar cualquier cambio que se haya intentado subir durante el arranque
                processSyncQueue();

                // ── Suscripción Realtime ─────────────────────────
                if (!globalSubscription) {
                    globalSubscription = supabaseCloud
                        .channel(`sync:${userId}`)
                        .on('postgres_changes', {
                            event: '*',
                            schema: 'public',
                            table: 'sync_documents',
                            filter: `user_id=eq.${userId}`
                        }, async (payload) => {
                            const doc = payload.new;
                            if (!doc || !['store', 'local'].includes(doc.collection)) return;
                            
                            // Ignorar si nosotros mismos estamos intentando subir cambios de esta misma llave
                            const queue = getSyncQueue();
                            if (queue.includes(doc.doc_id)) return;

                            console.log(`[CloudSync] Recibido P2P: ${doc.doc_id}`);
                            await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
                        })
                        .subscribe((status) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('[CloudSync] Conectado en Tiempo Real');
                            }
                        });
                }

            } catch (err) {
                console.error('[CloudSync] Error inicialización P2P:', err);
                isInitialized.current = false;
            }
        };

        initSync();
    }, [isCloudConfigured, adminEmail, adminPassword]);
}
