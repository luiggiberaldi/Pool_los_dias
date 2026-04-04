import localforage from 'localforage';
import { supabaseCloud as supabase } from '../config/supabaseCloud';

const QUEUE_KEY = 'offline_sales_queue';

export const offlineQueueService = {
  async addSaleToQueue(salePayload) {
    const queue = await localforage.getItem(QUEUE_KEY) || [];
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

  async syncPendingSales() {
    const queue = await localforage.getItem(QUEUE_KEY) || [];
    const now = Date.now();
    const pending = queue.filter(q =>
      q.sync_status === 'pending' &&
      !(q.next_retry_at && now < q.next_retry_at)
    );

    if (pending.length === 0) {
      // Still purge old synced/failed items even when nothing to sync
      const purged = queue.filter(q => {
        if (q.sync_status === 'synced' && q.synced_at && now - q.synced_at > 24 * 60 * 60 * 1000) return false;
        if (q.sync_status === 'failed' && q.failed_at && now - q.failed_at > 24 * 60 * 60 * 1000) return false;
        return true;
      });
      if (purged.length !== queue.length) {
        await localforage.setItem(QUEUE_KEY, purged);
      }
      return;
    }

    let updatedQueue = [...queue];

    for (const item of pending) {
      try {
        const payloadWithOrigin = {
          ...item.payload,
          sync_origin: 'offline_sync',
          original_created_at: item.created_at
        };

        const { data, error } = await supabase.rpc('process_checkout', { payload: payloadWithOrigin });

        if (error) throw error;

        updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'synced', synced_at: Date.now() } : q);
      } catch (err) {
        console.error('[Offline Sync] Fallo al sincronizar venta offline:', err);
        const attempts = item.attempts + 1;

        // Unrecoverable constraint violation - mark as failed immediately
        if (err?.code === '22P02') {
            console.warn(`[Offline Sync] Venta marcada como fallida (error irreparable ${err.code}): ${err.message}`);
            updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'failed', failed_at: Date.now(), last_error: err.message } : q);
        } else if (attempts >= 10) {
            console.warn(`[Offline Sync] Venta marcada como fallida tras ${attempts} intentos: ${err.message}`);
            updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'failed', failed_at: Date.now(), attempts, last_error: err.message } : q);
        } else {
            const nextRetryAt = Date.now() + Math.min(300000, 1000 * Math.pow(2, attempts));
            updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, attempts, next_retry_at: nextRetryAt } : q);
        }
      }
    }

    // Keep all items; only purge synced/failed items older than 24 hours
    const purgedQueue = updatedQueue.filter(q => {
      if (q.sync_status === 'synced' && q.synced_at && now - q.synced_at > 24 * 60 * 60 * 1000) return false;
      if (q.sync_status === 'failed' && q.failed_at && now - q.failed_at > 24 * 60 * 60 * 1000) return false;
      return true;
    });
    await localforage.setItem(QUEUE_KEY, purgedQueue);
  }
};

let syncScheduled = false;
window.addEventListener('online', () => {
    if (syncScheduled) return;
    syncScheduled = true;
    setTimeout(() => {
        syncScheduled = false;
        console.log("[Offline Sync] Internet restaurado. Sincronizando ventas pendientes...");
        offlineQueueService.syncPendingSales();
    }, 2000); // 2 second debounce
});
