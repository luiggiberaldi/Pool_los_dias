import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, Wifi, WifiOff } from 'lucide-react';

/**
 * SyncStatus — Indicador visual de conectividad.
 * Muestra un icono de nube en la barra superior que refleja:
 * - Online:  Nube verde con check
 * - Offline: Nube roja tachada
 */
export default function SyncStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    return (
        <div
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-bold tracking-wider transition-all duration-300 shadow-sm border ${
                isOnline
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                    : 'bg-rose-50 border-rose-100 text-rose-500 animate-pulse'
            }`}
            title={isOnline ? 'Conectado a Internet' : 'Sin conexion a Internet'}
        >
            {isOnline ? (
                <>
                    <Wifi size={13} strokeWidth={2.5} />
                    <span className="hidden sm:inline">Online</span>
                </>
            ) : (
                <>
                    <WifiOff size={13} strokeWidth={2.5} />
                    <span>Offline</span>
                </>
            )}
        </div>
    );
}
