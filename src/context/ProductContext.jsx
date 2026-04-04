import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { storageService } from '../utils/storageService';
import { BODEGA_CATEGORIES } from '../config/categories';

const ProductContext = createContext();

export function ProductProvider({ children, rates }) {
    const [products, _setProducts] = useState([]);
    const [categories, _setCategories] = useState(BODEGA_CATEGORIES);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [isSyncReady, setIsSyncReady] = useState(false);

    // Guard ref: prevents app_storage_update loop when user edits locally
    const savingRef = useRef(false);

    // Custom setters to forcefully save user-initiated changes but skip cloud pulls
    const setProducts = (action_or_val) => {
        savingRef.current = true;
        if (typeof action_or_val === 'function') {
            _setProducts(prev => {
                const next = action_or_val(prev);
                storageService.setItem('bodega_products_v1', next).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
                return next;
            });
        } else {
            _setProducts(action_or_val);
            storageService.setItem('bodega_products_v1', action_or_val).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
        }
    };

    const setCategories = (action_or_val) => {
        savingRef.current = true;
        if (typeof action_or_val === 'function') {
            _setCategories(prev => {
                const next = action_or_val(prev);
                storageService.setItem('poolbar_categories_v1', next).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
                return next;
            });
        } else {
            _setCategories(action_or_val);
            storageService.setItem('poolbar_categories_v1', action_or_val).finally(() => { setTimeout(() => { savingRef.current = false; }, 50); });
        }
    };

    // MARKET LOGIC - Street Rate
    const [streetRate, setStreetRate] = useState(() => {
        const saved = localStorage.getItem('street_rate_bs');
        return saved ? parseFloat(saved) : 0;
    });

    // GLOBAL RATE LOGIC (Sync with SalesView)
    const [useAutoRate, setUseAutoRate] = useState(() => {
        const saved = localStorage.getItem('bodega_use_auto_rate');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [customRate, setCustomRate] = useState(() => {
        const saved = localStorage.getItem('bodega_custom_rate');
        return saved && parseFloat(saved) > 0 ? saved : '';
    });

    // AUTO COP LOGIC
    const [copEnabled, setCopEnabled] = useState(() => {
        return localStorage.getItem('cop_enabled') === 'true';
    });
    const [autoCopEnabled, setAutoCopEnabled] = useState(() => {
        return localStorage.getItem('auto_cop_enabled') === 'true';
    });
    const [tasaCopManual, setTasaCopManual] = useState(() => {
        return localStorage.getItem('tasa_cop') || '';
    });

    const effectiveRate = useAutoRate ? rates.bcv?.price : (parseFloat(customRate) > 0 ? parseFloat(customRate) : rates.bcv?.price);
    
    // Calcula el COP efectivo. rates.autoCopRate es calculado en useRates basado en TRM y la Brecha USDT/BCV.
    const tasaCop = autoCopEnabled && rates.autoCopRate?.price 
        ? rates.autoCopRate.price 
        : (parseFloat(tasaCopManual) > 0 ? parseFloat(tasaCopManual) : 4150);

    // Initial Load
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            const savedProducts = await storageService.getItem('bodega_products_v1', []);
            const savedCategories = await storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES);
            if (isMounted) {
                _setProducts(savedProducts);
                _setCategories(savedCategories);
                setIsLoadingProducts(false);
            }
        };
        loadData();
        return () => { isMounted = false; };
    }, []);

    // Set Initial Street Rate (from BCV)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        if (!streetRate && rates.bcv?.price > 0 && !localStorage.getItem('street_rate_bs')) {
            setStreetRate(rates.bcv.price);
        }
    }, [rates.bcv?.price, streetRate]);

    // Auto-save useEffect is REMOVED: Saving is now strictly handled by setProducts explicitly.
    // This entirely removes the Race Condition where boots/reloads overwrite cloud databases.

    useEffect(() => {
        if (streetRate > 0) localStorage.setItem('street_rate_bs', streetRate.toString());
    }, [streetRate]);

    useEffect(() => {
        localStorage.setItem('bodega_use_auto_rate', JSON.stringify(useAutoRate));
        if (customRate) localStorage.setItem('bodega_custom_rate', customRate.toString());
    }, [useAutoRate, customRate]);

    // Listener para actualizar si cambia en otra pestaña/componente
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'bodega_custom_rate') {
                setCustomRate(e.newValue);
            }
            if (e.key === 'bodega_use_auto_rate') {
                setUseAutoRate(!!JSON.parse(e.newValue));
            }
            if (e.key === 'cop_enabled') {
                setCopEnabled(e.newValue === 'true');
            }
            if (e.key === 'auto_cop_enabled') {
                setAutoCopEnabled(e.newValue === 'true');
            }
            if (e.key === 'tasa_cop') {
                setTasaCopManual(e.newValue);
            }
            if (e.key === 'bodega_products_v1') {
                // If modified in another tab, fetch it silently using internal setter
                storageService.getItem('bodega_products_v1', []).then(updatedProducts => _setProducts(updatedProducts));
            }
            if (e.key === 'poolbar_categories_v1') {
                storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES).then(updatedCategories => _setCategories(updatedCategories));
            }
        };

        // Mantener app_storage_update por si algún componente viejo sigue usándolo para sincronizar
        // aunque ahora ProductContext centraliza todo.
        const handleAppStorageUpdate = async (e) => {
            if (savingRef.current) return;

            if (e.detail?.key === 'bodega_products_v1') {
                const updatedProducts = await storageService.getItem('bodega_products_v1', []);
                _setProducts(updatedProducts);
            }
            if (e.detail?.key === 'poolbar_categories_v1') {
                const updatedCategories = await storageService.getItem('poolbar_categories_v1', BODEGA_CATEGORIES);
                _setCategories(updatedCategories);
            }
        };

        const handleSyncReady = () => {
            console.log("[ProductContext] Detectada sincronización inicial completa.");
            setIsSyncReady(true);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('app_storage_update', handleAppStorageUpdate);
        window.addEventListener('sync_initial_completed', handleSyncReady);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('app_storage_update', handleAppStorageUpdate);
            window.removeEventListener('sync_initial_completed', handleSyncReady);
        };
    }, []);

    const adjustStock = (productId, delta) => {
        setProducts(prevProducts => prevProducts.map(p => {
            if (p.id === productId) {
                const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
                const newStock = (p.stock ?? 0) + delta;
                return { ...p, stock: allowNeg ? newStock : Math.max(0, newStock) };
            }
            return p;
        }));
    };

    return (
        <ProductContext.Provider value={{
            products,
            setProducts,
            // setProductsSilent: updates UI ONLY, no save to storage/cloud.
            // Use this after receiving data from cloud to avoid re-upload loops.
            setProductsSilent: _setProducts,
            categories,
            setCategories,
            isLoadingProducts,
            streetRate,
            setStreetRate,
            useAutoRate,
            setUseAutoRate,
            customRate,
            setCustomRate,
            effectiveRate,
            copEnabled,
            setCopEnabled,
            autoCopEnabled,
            setAutoCopEnabled,
            tasaCopManual,
            setTasaCopManual,
            tasaCop,
            adjustStock
        }}>
            {children}
        </ProductContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProductContext = () => {
    const context = useContext(ProductContext);
    if (!context) {
        throw new Error("useProductContext must be used within a ProductProvider");
    }
    return context;
};
