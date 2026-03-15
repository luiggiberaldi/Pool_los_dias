import localforage from 'localforage';

// Configuración inicial de IndexedDB
localforage.config({
    name: 'BodegaApp',
    storeName: 'bodega_app_data',
    description: 'Almacenamiento local optimizado para PWA de Bodega'
});

/**
 * Servicio de almacenamiento que previene el límite de 5MB de localStorage
 * Migrando los datos pesados a IndexedDB a través de localforage.
 */
export const storageService = {
    /**
     * Obtiene un item de IndexedDB.
     * Si no existe, intenta leerlo de localStorage (Retrocompatibilidad),
     * lo guarda en IndexedDB y lo borra de localStorage.
     */
    async getItem(key, defaultValue = null) {
        try {
            // 1. Intentar leer de IndexedDB
            const value = await localforage.getItem(key);

            if (value !== null) {
                return value;
            }

            // 2. Si no existe, revisar LocalStorage (Migración al vuelo)
            const fallbackValue = localStorage.getItem(key);
            if (fallbackValue !== null) {
                // Migración silenciosa de localStorage a IndexedDB

                let parsedValue;
                try {
                    parsedValue = JSON.parse(fallbackValue);
                } catch (e) {
                    parsedValue = fallbackValue; // A veces guardamos strings directos
                }

                // Guardar en la nueva base de datos
                await localforage.setItem(key, parsedValue);

                // Borrar el viejo para liberar el preciado espacio de 5MB
                localStorage.removeItem(key);

                return parsedValue;
            }

            // 3. No existe en ningún lado
            return defaultValue;

        } catch (error) {
            console.error(`[Storage Error] Leyendo ${key}:`, error);
            // Fallback drástico en caso de que el navegador bloquee IndexedDB por privacidad extrema
            const backup = localStorage.getItem(key);
            if (backup) {
                try { return JSON.parse(backup); } catch (e) { return backup; }
            }
            return defaultValue;
        }
    },

    /**
     * Guarda un item directamente en IndexedDB
     */
    async setItem(key, value) {
        try {
            await localforage.setItem(key, value);
        } catch (error) {
            console.error(`[Storage Error] Guardando ${key}:`, error);
            // Fallback de emergencia a localStorage si falla algo catastrófico
            try {
                localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            } catch (e) {
                console.error(`[Storage Error CRÍTICO] Ni IndexedDB ni LocalStorage funcionan para ${key}`, e);
            }
        }
    },

    /**
     * Elimina un item
     */
    async removeItem(key) {
        try {
            await localforage.removeItem(key);
            localStorage.removeItem(key); // Por si acaso quedó algún residuo
        } catch (error) {
            console.error(`[Storage Error] Borrando ${key}:`, error);
        }
    }
};
