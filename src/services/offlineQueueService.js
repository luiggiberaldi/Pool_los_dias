import localforage from 'localforage';
import { supabaseCloud as supabase } from '../config/supabaseCloud';

const QUEUE_KEY = 'offline_sales_queue';
const SYNC_LOCK_KEY = '_poolbar_offline_sync_lock';
const LOCK_TTL = 30_000; // 30s — si un tab crashea, el lock expira
const RPC_TIMEOUT = 12_000; // 12s timeout para cada RPC

// Errores de PostgreSQL que NUNCA van a resolverse reintentando
const UNRECOVERABLE_CODES = new Set([
  '22P02', // invalid_text_representation
  '23505', // unique_violation (venta ya procesada)
  '23001', // restrict_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '42501', // insufficient_privilege
]);

// ─── Lock Multi-Tab ────────────────────────────────────────────────────────
function acquireSyncLock() {
    try {
        const raw = localStorage.getItem(SYNC_LOCK_KEY);
        if (raw) {
            const existing = JSON.parse(raw);
            if (existing && Date.now() - existing.ts < LOCK_TTL) return false;
        }
        localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify({ ts: Date.now() }));
        return true;
    } catch { return true; } // Si falla lectura, proceder
}

function releaseSyncLock() {
    try { localStorage.removeItem(SYNC_LOCK_KEY); } catch {}
}

// ─── Timeout wrapper ───────────────────────────────────────────────────────
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('SYNC_TIMEOUT')), ms)
        )
    ]);
}

export const offlineQueueService = {
  async addSaleToQueue(salePayload) {
    const queue = await localforage.getItem(QUEUE_KEY) || [];

    // Deduplicación: si ya existe un item pending con la misma idempotency_key, no duplicar
    if (salePayload.idempotency_key) {
        const duplicate = queue.find(q =>
            q.sync_status === 'pending' &&
            q.payload?.idempotency_key === salePayload.idempotency_key
        );
        if (duplicate) {
            console.warn('[Offline Sync] Venta duplicada detectada, ignorando:', salePayload.idempotency_key);
            return duplicate;
        }
    }

    const newEntry = {
      id: crypto.randomUUID(),
      payload: salePayload,
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      attempts: 0
    };
    await localforage.setItem(QUEUE_KEY, [...queue, newEntry]);
    return newEntry;
  },

  async syncPendingSales(force = false) {
    // Lock multi-tab: solo un tab sincroniza a la vez
    if (!acquireSyncLock()) {
        console.log('[Offline Sync] Otra pestaña está sincronizando. Saltando.');
        return { synced: 0, failed: 0, pending: 0 };
    }

    let synced = 0, failed = 0;

    try {
        // Verify active session before attempting RPC calls
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            console.warn('[Offline Sync] No hay sesión activa — no se puede sincronizar.');
            const queue = await localforage.getItem(QUEUE_KEY) || [];
            const totalPending = queue.filter(q => q.sync_status === 'pending').length;
            return { synced: 0, failed: 0, pending: totalPending };
        }

        const queue = await localforage.getItem(QUEUE_KEY) || [];
        const now = Date.now();
        const totalPending = queue.filter(q => q.sync_status === 'pending').length;
        const pending = queue.filter(q =>
          q.sync_status === 'pending' &&
          (force || !(q.next_retry_at && now < q.next_retry_at))
        );

        if (pending.length === 0) {
          // Purgar items viejos synced/failed (> 24h)
          const purged = queue.filter(q => {
            if (q.sync_status === 'synced' && q.synced_at && now - q.synced_at > 24 * 60 * 60 * 1000) return false;
            if (q.sync_status === 'failed' && q.failed_at && now - q.failed_at > 24 * 60 * 60 * 1000) return false;
            return true;
          });
          if (purged.length !== queue.length) {
            await localforage.setItem(QUEUE_KEY, purged);
          }
          return { synced: 0, failed: 0, pending: totalPending };
        }

        let updatedQueue = [...queue];

        for (const item of pending) {
          try {
            // Ajustar pagos: si la suma de pagos > total, hay vuelto que no
            // fue descontado (payloads creados antes del fix). Restar el exceso
            // del último pago para que Débito == Crédito en doble partida.
            let adjustedPayments = [...(item.payload.payments || [])];
            const payTotal = adjustedPayments.reduce((s, p) => s + (p.amountUsd || 0), 0);
            const saleTotal = item.payload.total || 0;
            const fiado = item.payload.fiadoUsd || 0;
            const excess = payTotal + fiado - saleTotal;
            if (excess > 0.01 && adjustedPayments.length > 0) {
              let rem = excess;
              for (let i = adjustedPayments.length - 1; i >= 0 && rem > 0.01; i--) {
                const red = Math.min(rem, adjustedPayments[i].amountUsd);
                adjustedPayments[i] = { ...adjustedPayments[i], amountUsd: Math.round((adjustedPayments[i].amountUsd - red) * 100) / 100 };
                rem = Math.round((rem - red) * 100) / 100;
              }
              adjustedPayments = adjustedPayments.filter(p => p.amountUsd > 0.01);
            }

            const payloadWithOrigin = {
              ...item.payload,
              payments: adjustedPayments,
              sync_origin: 'offline_sync',
              original_created_at: item.created_at
            };

            // RPC con timeout — no colgar indefinidamente
            const { data, error } = await withTimeout(
                supabase.rpc('process_checkout', { payload: payloadWithOrigin }),
                RPC_TIMEOUT
            );

            if (error) throw error;

            updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'synced', synced_at: Date.now() } : q);
            synced++;
          } catch (err) {
            console.error('[Offline Sync] Fallo al sincronizar venta offline:', err);
            const attempts = item.attempts + 1;
            const errCode = err?.code;
            const isTimeout = err?.message === 'SYNC_TIMEOUT';

            // Errores irrecuperables — no reintentar jamás
            if (UNRECOVERABLE_CODES.has(errCode)) {
                console.warn(`[Offline Sync] Venta marcada como fallida (error irreparable ${errCode}): ${err.message}`);
                updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'failed', failed_at: Date.now(), last_error: `${errCode}: ${err.message}` } : q);
                failed++;
            } else if (attempts >= 10) {
                console.warn(`[Offline Sync] Venta marcada como fallida tras ${attempts} intentos: ${err.message}`);
                updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'failed', failed_at: Date.now(), attempts, last_error: err.message } : q);
                failed++;
            } else {
                // Backoff exponencial: 2s, 4s, 8s, 16s... hasta max 5 min
                // Si fue timeout, backoff más agresivo (x2)
                const baseDelay = isTimeout ? 2000 : 1000;
                const nextRetryAt = Date.now() + Math.min(300_000, baseDelay * Math.pow(2, attempts));
                updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, attempts, next_retry_at: nextRetryAt } : q);
            }
          }
        }

        // Purgar items viejos synced/failed (> 24h)
        const purgedQueue = updatedQueue.filter(q => {
          if (q.sync_status === 'synced' && q.synced_at && now - q.synced_at > 24 * 60 * 60 * 1000) return false;
          if (q.sync_status === 'failed' && q.failed_at && now - q.failed_at > 24 * 60 * 60 * 1000) return false;
          return true;
        });
        await localforage.setItem(QUEUE_KEY, purgedQueue);

        const remainingPending = purgedQueue.filter(q => q.sync_status === 'pending').length;
        return { synced, failed, pending: remainingPending };
    } finally {
        releaseSyncLock();
    }
  }
};

let syncScheduled = false;
window.addEventListener('online', () => {
    if (syncScheduled) return;
    syncScheduled = true;
    setTimeout(() => {
        syncScheduled = false;
        console.log("[Offline Sync] Internet restaurado. Sincronizando ventas pendientes...");
        offlineQueueService.syncPendingSales(true);
    }, 2000);
});
