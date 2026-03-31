import { useEffect, useRef } from 'react';
import { storageService } from '../utils/storageService';
import { supabaseCloud as supabase } from '../config/supabaseCloud';

const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const BACKUP_KEY = 'bodega_autobackup_v1';

// Claves criticas que se respaldan
const CRITICAL_KEYS = [
    'bodega_products_v1',
    'bodega_customers_v1',
    'bodega_sales_v1',
    'bodega_payment_methods_v1',
    'monitor_rates_v12',
];

export function useAutoBackup(isPremium, isDemo, deviceId) {
    const intervalRef = useRef(null);

    useEffect(() => {
        const performBackup = async () => {
            try {
                const snapshot = {};
                let hasData = false;

                for (const key of CRITICAL_KEYS) {
                    const val = await storageService.getItem(key, null);
                    if (val !== null) {
                        snapshot[key] = val;
                        hasData = true;
                    }
                }

                if (!hasData) return;

                await storageService.setItem(BACKUP_KEY, {
                    data: snapshot,
                    timestamp: Date.now(),
                    device: navigator.userAgent?.substring(0, 80),
                });

                // Si es usuario premium permanente y tiene deviceId, subir el backup a la nube silenciosamente
                if (isPremium && !isDemo && deviceId) {
                    await supabase.from('device_backups').upsert({
                        device_id: deviceId,
                        product_id: 'bodega',
                        backup_data: snapshot,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'device_id' });
                }

            } catch (e) {
                console.error('[AutoBackup] Error:', e);
            }
        };

        // Primer backup 15s despues del arranque
        const initialTimer = setTimeout(performBackup, 15000);

        // Backup cada 5 minutos
        intervalRef.current = setInterval(performBackup, BACKUP_INTERVAL_MS);

        return () => {
            clearTimeout(initialTimer);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isPremium, isDemo, deviceId]);
}

// Restaurar desde backup (para emergencias)
export async function restoreFromBackup() {
    const backup = await storageService.getItem('bodega_autobackup_v1', null);
    if (!backup?.data) return null;

    for (const [key, val] of Object.entries(backup.data)) {
        await storageService.setItem(key, val);
    }

    return {
        restoredKeys: Object.keys(backup.data),
        backupTime: new Date(backup.timestamp).toLocaleString('es-VE'),
    };
}
