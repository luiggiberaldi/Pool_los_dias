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
    'auto_cop_enabled'
];

// Llaves que van a colección 'local' (localStorage); el resto va a 'store' (IndexedDB)
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
let isSyncingFromCloud = false; // true mientras aplicamos cambios de la nube → evita eco
let pendingPush = {};           // Debounce: { [key]: timeoutId }

// Interceptor de localStorage — solo para llaves 'local'
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
    }, 300);
}

/**
 * Empuja una llave al sincronizador de Supabase.
 * Llamado desde storageService (colección 'store') y el interceptor localStorage (colección 'local').
 */
export const pushCloudSync = async (key, value) => {
    if (isSyncingFromCloud) return;          // Nunca re-emitir lo que llegó de la nube
    if (!SYNC_KEYS.includes(key)) return;

    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) return;

        const collectionType = LOCAL_KEYS.includes(key) ? 'local' : 'store';

        await supabaseCloud.from('sync_documents').upsert({
            user_id: session.user.id,
            collection: collectionType,
            doc_id: key,
            data: { payload: value },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,collection,doc_id' });

    } catch (e) {
        console.warn('[CloudSync] Error al enviar a la nube:', e.message ?? e);
    }
};

/**
 * Aplica un documento recibido de la nube al almacenamiento local.
 * Garantiza que isSyncingFromCloud esté activo durante toda la operación.
 */
async function _applyFromCloud(docId, collection, payload) {
    isSyncingFromCloud = true;
    try {
        if (collection === 'local') {
            const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
            originalSetItem(docId, stringPayload);   // Escribe sin pasar por el interceptor
            window.dispatchEvent(new StorageEvent('storage', {
                key: docId,
                newValue: stringPayload,
                storageArea: localStorage
            }));
            if (docId === 'abasto-auth-storage') {
                useAuthStore.persist.rehydrate();
            }
        } else {
            // Colección 'store' → IndexedDB directo, sin pasar por storageService.setItem
            const { default: localforage } = await import('localforage');
            localforage.config({ name: 'BodegaApp', storeName: 'bodega_app_data' });
            await localforage.setItem(docId, payload);

            // Notificar a los componentes React que lean este store
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: docId } }));
        }
    } finally {
        isSyncingFromCloud = false;
    }
}

// ─── Hook de React ─────────────────────────────────────────────────────────
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

                if (!session?.user?.id && adminEmail && adminPassword) {
                    const loginRes = await supabaseCloud.auth.signInWithPassword({
                        email: adminEmail,
                        password: adminPassword
                    });
                    if (loginRes.error) throw loginRes.error;
                    session = loginRes.data.session;
                }

                if (!session?.user?.id) return;

                isInitialized.current = true;
                const userId = session.user.id;

                // ── Pull Inicial ───────────────────────────────────────────
                const { data: docs } = await supabaseCloud
                    .from('sync_documents')
                    .select('collection, doc_id, data')
                    .in('collection', ['store', 'local']);

                if (docs?.length > 0) {
                    for (const doc of docs) {
                        await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
                    }
                    console.log(`[CloudSync] Pull inicial: ${docs.length} documentos aplicados.`);
                }

                // ── Suscripción WebSocket Realtime ─────────────────────────
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
                            console.log(`[CloudSync] Recibido: ${doc.doc_id}`);
                            await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
                        })
                        .subscribe((status) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('[CloudSync] Conectado y escuchando P2P en Tiempo Real');
                            }
                        });
                }

            } catch (err) {
                console.error('[CloudSync] Fallo en inicialización P2P:', err);
                isInitialized.current = false; // Permitir reintento
            }
        };

        initSync();

        return () => {
            // No desuscribir en cleanup del efecto — la suscripción debe vivir mientras la app esté abierta
        };
    }, [isCloudConfigured, adminEmail, adminPassword]);
}
