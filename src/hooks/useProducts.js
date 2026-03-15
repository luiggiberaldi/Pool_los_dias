import { useState, useEffect } from 'react';
import { storageService } from '../utils/storageService';
import { BODEGA_CATEGORIES } from '../config/categories';

export function useProducts(rates) {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState(BODEGA_CATEGORIES);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);

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

    const effectiveRate = useAutoRate ? rates.bcv?.price : (parseFloat(customRate) > 0 ? parseFloat(customRate) : rates.bcv?.price);

    // Initial Load
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            const savedProducts = await storageService.getItem('bodega_products_v1', []);
            const savedCategories = await storageService.getItem('my_categories_v1', BODEGA_CATEGORIES);
            if (isMounted) {
                setProducts(savedProducts);
                setCategories(savedCategories);
                setIsLoadingProducts(false);
            }
        };
        loadData();
        return () => { isMounted = false; };
    }, []);

    // Set Initial Street Rate (from BCV)
    useEffect(() => {
        if (!streetRate && rates.bcv?.price > 0 && !localStorage.getItem('street_rate_bs')) {
            setStreetRate(rates.bcv.price);
        }
    }, [rates.bcv?.price, streetRate]);

    // Auto-save products and categories
    useEffect(() => {
        if (!isLoadingProducts) {
            if (products.length > 0) {
                storageService.setItem('bodega_products_v1', products);
            } else {
                storageService.removeItem('bodega_products_v1');
            }
            storageService.setItem('my_categories_v1', categories);
        }
    }, [products, categories, isLoadingProducts]);

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
                setUseAutoRate(JSON.parse(e.newValue));
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const adjustStock = (productId, delta) => {
        setProducts(products.map(p => {
            if (p.id === productId) {
                const newStock = Math.max(0, (p.stock ?? 0) + delta);
                return { ...p, stock: newStock };
            }
            return p;
        }));
    };

    return {
        products,
        setProducts,
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
        adjustStock
    };
}
