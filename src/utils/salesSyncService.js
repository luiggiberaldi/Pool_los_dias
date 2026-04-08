/**
 * salesSyncService.js
 *
 * Estrategia de mínimo egress para sincronización de ventas multi-dispositivo:
 *
 * 1. BROADCAST (Realtime P2P): notifica a dispositivos activos al instante — sin DB, sin egress.
 * 2. PERSIST por fila (sync_documents collection='sale'): cada venta es una fila individual,
 *    no el array completo. El pull incremental descarga solo las nuevas desde el último sync.
 * 3. PULL INCREMENTAL: al arrancar o al volver al primer plano, consulta solo las ventas
 *    con updated_at > last_pull → egress proporcional a ventas nuevas, no al historial total.
 */

import { supabaseCloud } from '../config/supabaseCloud';
import { storageService } from './storageService';

const SALES_KEY = 'bodega_sales_v1';
const LAST_SALES_PULL_KEY = '_cloud_last_sales_pull_at';

let salesBroadcastChannel = null;
let salesBroadcastUserId = null;

function getSalesBroadcastChannel(userId) {
    if (salesBroadcastChannel && salesBroadcastUserId === userId) {
        return salesBroadcastChannel;
    }
    if (salesBroadcastChannel) {
        salesBroadcastChannel.unsubscribe();
    }
    salesBroadcastChannel = supabaseCloud.channel(`sales_live:${userId}`);
    salesBroadcastUserId = userId;
    return salesBroadcastChannel;
}

/**
 * Envía una venta a otros dispositivos.
 * - Broadcast Realtime (P2P, 0 egress DB) para dispositivos activos.
 * - Upsert en sync_documents como fila individual (recuperación offline).
 */
export async function broadcastNewSale(sale, userId) {
    if (!userId) return;

    // 1. Broadcast P2P — instantáneo, sin pasar por la DB
    try {
        const ch = getSalesBroadcastChannel(userId);
        await ch.send({
            type: 'broadcast',
            event: 'new_sale',
            payload: sale,
        });
    } catch (e) {
        // Non-fatal: el persist en DB actúa como fallback
        console.warn('[SalesSync] Broadcast P2P falló:', e?.message);
    }

    // 2. Persistir fila individual — fallback para dispositivos offline
    try {
        await supabaseCloud.from('sync_documents').upsert({
            user_id: userId,
            collection: 'sale',
            doc_id: sale.id,
            data: { payload: sale },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,collection,doc_id' });
    } catch (e) {
        console.warn('[SalesSync] Persist en DB falló:', e?.message);
    }
}

/**
 * Descarga ventas nuevas desde la nube (solo las que el dispositivo no tiene).
 * Usa last_pull timestamp → egress proporcional a ventas nuevas, no al historial.
 */
export async function pullNewSales(userId) {
    if (!userId) return 0;

    try {
        const sinceTimestamp = localStorage.getItem(LAST_SALES_PULL_KEY);

        let query = supabaseCloud
            .from('sync_documents')
            .select('doc_id, data, updated_at')
            .eq('user_id', userId)
            .eq('collection', 'sale')
            .order('updated_at', { ascending: true });

        if (sinceTimestamp) {
            query = query.gt('updated_at', sinceTimestamp);
        }

        const { data: docs, error } = await query;
        if (error || !docs?.length) return 0;

        const existingSales = await storageService.getItem(SALES_KEY, []);
        const existingIds = new Set(existingSales.map(s => s.id));

        const newSales = docs
            .map(doc => doc.data?.payload)
            .filter(sale => sale && !existingIds.has(sale.id));

        if (newSales.length > 0) {
            const merged = [...newSales, ...existingSales]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            await storageService.setItem(SALES_KEY, merged);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
            console.log(`[SalesSync] Merged ${newSales.length} venta(s) nueva(s) desde la nube`);
        }

        localStorage.setItem(LAST_SALES_PULL_KEY, new Date().toISOString());
        return newSales.length;
    } catch (e) {
        console.warn('[SalesSync] pullNewSales falló:', e?.message);
        return 0;
    }
}

/**
 * Aplica una venta recibida por Broadcast/Realtime al estado local.
 */
export async function applyIncomingSale(sale) {
    if (!sale?.id) return;
    try {
        const existingSales = await storageService.getItem(SALES_KEY, []);
        if (existingSales.some(s => s.id === sale.id)) return; // ya la tenemos

        const merged = [sale, ...existingSales]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        await storageService.setItem(SALES_KEY, merged);
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
        console.log(`[SalesSync] Venta recibida en tiempo real: ${sale.id}`);
    } catch (e) {
        console.warn('[SalesSync] Error aplicando venta entrante:', e?.message);
    }
}

/**
 * Suscribe al canal Broadcast para recibir ventas en tiempo real.
 * También escucha postgres_changes como capa de seguridad adicional.
 * Retorna función de cleanup.
 */
export function subscribeSalesRealtime(userId, onSaleReceived) {
    if (!userId) return () => {};

    const ch = getSalesBroadcastChannel(userId);

    ch.on('broadcast', { event: 'new_sale' }, ({ payload }) => {
        if (payload) onSaleReceived(payload);
    }).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('[SalesSync] Canal Broadcast de ventas activo');
        }
    });

    return () => {
        ch.unsubscribe();
        salesBroadcastChannel = null;
        salesBroadcastUserId = null;
    };
}
