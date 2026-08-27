import { useState, useEffect, useRef } from 'react';
import { Package, Calculator, ChevronDown, ChevronLeft, ChevronRight, Grid, HelpCircle, Trash2 } from 'lucide-react';
import { BODEGA_CATEGORIES, CATEGORY_ICONS } from '../../config/categories';

const PAGE_SIZE = 30;

const formatBs = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * CategoryBar — port PLAN-CAJA-ESPACIO (referencia: preciosaldia-bodega).
 * - Cards con imagen protagonista (aspect-square), badge flotante de stock y doble precio.
 * - Chips de categoría para PC: flechas de scroll, "Ver todas" (wrap) y contador por categoría.
 * - Barra de acciones rápidas (Ayuda, Vaciar cesta F4) y footer de atajos.
 */
export default function CategoryBar({
    selectedCategory,
    setSelectedCategory,
    filteredByCategory,
    addToCart,
    triggerHaptic,
    searchTerm = '',
    onOpenCustomAmount,
    products = [],
    effectiveRate = 1,
    cartCount = 0,
    onClearCart,
    onOpenHelp,
}) {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    // Reset pagination during render when category changes (no cascading effect)
    const [prevCategory, setPrevCategory] = useState(selectedCategory);
    if (prevCategory !== selectedCategory) {
        setPrevCategory(selectedCategory);
        setVisibleCount(PAGE_SIZE);
    }

    // PC / Desktop chip-scroller states
    const categoryScrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    // Mapa de imágenes rotas (fallback sin estado por-card)
    const [brokenImages, setBrokenImages] = useState({});

    const checkScrollState = () => {
        const el = categoryScrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    useEffect(() => {
        const el = categoryScrollRef.current;
        if (!el) return;
        checkScrollState();
        const handler = (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
                checkScrollState();
            }
        };
        el.addEventListener('wheel', handler, { passive: false });
        el.addEventListener('scroll', checkScrollState);
        window.addEventListener('resize', checkScrollState);
        return () => {
            el.removeEventListener('wheel', handler);
            el.removeEventListener('scroll', checkScrollState);
            window.removeEventListener('resize', checkScrollState);
        };
    }, []);

    const scrollByAmount = (amount) => {
        if (categoryScrollRef.current) {
            categoryScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
            setTimeout(checkScrollState, 250);
        }
    };

    const visibleProducts = filteredByCategory.slice(0, visibleCount);
    const hasMore = filteredByCategory.length > visibleCount;
    const allowNegativeStock = localStorage.getItem('allow_negative_stock') === 'true';

    // Solo categorías con al menos un producto
    const activeCategories = BODEGA_CATEGORIES.filter(cat => cat.id === 'todos' || products.some(p => p.category === cat.id));

    const handleImageError = (productId) => (e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.style.display = 'none';
        setBrokenImages(prev => ({ ...prev, [productId]: true }));
    };

    return (
        <div className={`relative ${searchTerm.length === 0 ? 'lg:flex-1 lg:overflow-hidden lg:flex lg:flex-col lg:min-h-0' : ''}`}>

            {/* ── Chips de categoría (PC: flechas + wrap) ── */}
            <div className="relative shrink-0 flex items-center gap-1">
                {canScrollLeft && !isExpanded && (
                    <button
                        onClick={() => { triggerHaptic && triggerHaptic(); scrollByAmount(-260); }}
                        className="hidden md:flex shrink-0 items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:border-emerald-400 transition-all active:scale-95 z-10"
                        title="Desplazar a la izquierda"
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}

                <div
                    ref={categoryScrollRef}
                    className={`flex-1 flex gap-1 py-1 px-0.5 ${isExpanded
                        ? 'flex-wrap max-h-32 overflow-y-auto'
                        : 'overflow-x-auto scrollbar-hide flex-nowrap'
                        }`}
                >
                    {/* Monto Libre */}
                    <button
                        onClick={() => { triggerHaptic && triggerHaptic(); onOpenCustomAmount && onOpenCustomAmount(); }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-black transition-all active:scale-95 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 shadow-sm"
                    >
                        <Calculator size={14} />
                        Monto Libre
                    </button>

                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 my-auto mx-0.5 rounded-full shrink-0" />

                    {activeCategories.map(cat => {
                        const isActive = selectedCategory === cat.id;
                        const CatIcon = CATEGORY_ICONS[cat.id];
                        const count = cat.id === 'todos' ? products.length : products.filter(p => p.category === cat.id).length;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => { triggerHaptic && triggerHaptic(); setSelectedCategory(isActive && cat.id !== 'todos' ? 'todos' : cat.id); }}
                                className={`shrink-0 flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-all active:scale-95 border ${isActive
                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 border-transparent'
                                    : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-emerald-400 hover:text-emerald-600'
                                    }`}
                            >
                                {CatIcon && !isActive && <CatIcon size={12} />}
                                {cat.label}
                                <span className={`text-[10px] ${isActive ? 'opacity-90' : 'text-slate-400 dark:text-slate-500'}`}>
                                    · {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {canScrollRight && !isExpanded && (
                    <button
                        onClick={() => { triggerHaptic && triggerHaptic(); scrollByAmount(260); }}
                        className="hidden md:flex shrink-0 items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:border-emerald-400 transition-all active:scale-95 z-10"
                        title="Desplazar a la derecha"
                    >
                        <ChevronRight size={16} />
                    </button>
                )}

                {activeCategories.length > 5 && (
                    <button
                        onClick={() => { setIsExpanded(!isExpanded); triggerHaptic && triggerHaptic(); }}
                        className="hidden md:flex shrink-0 items-center gap-1 px-2.5 py-2 min-h-[38px] rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                        title={isExpanded ? 'Vista carrusel' : 'Mostrar todas las categorías'}
                    >
                        {isExpanded ? <ChevronDown size={14} /> : <Grid size={14} />}
                        <span className="hidden lg:inline">{isExpanded ? 'Plegar' : 'Todas'}</span>
                    </button>
                )}
            </div>

            {/* ── Barra de acciones rápidas ── */}
            <div className="shrink-0 flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                    {onOpenHelp && (
                        <button
                            onClick={() => { triggerHaptic && triggerHaptic(); onOpenHelp(); }}
                            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wide hover:bg-indigo-100 transition-all active:scale-95"
                        >
                            <HelpCircle size={11} /> Ayuda (?)
                        </button>
                    )}
                </div>
                {cartCount > 0 && onClearCart && (
                    <button
                        onClick={onClearCart}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <Trash2 size={12} /> VACIAR CESTA
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-400 px-1 rounded text-[8px] font-black">F4</span>
                    </button>
                )}
            </div>

            {/* ── Grid de productos ── */}
            {searchTerm.length === 0 && (
                <div className="flex-1 overflow-y-auto min-h-0 pb-2">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                        {visibleProducts.map(p => {
                            let effectiveStock = p.stock ?? 0;
                            if (p.isCombo) {
                                const items = p.comboItems?.length > 0
                                    ? p.comboItems.map(ci => ({ product: products.find(lp => lp.id === ci.productId), qty: ci.qty }))
                                    : p.linkedProductId
                                        ? [{ product: products.find(lp => lp.id === p.linkedProductId), qty: p.linkedQty }]
                                        : [];
                                effectiveStock = items.length > 0 && items.every(i => i.product && i.qty > 0)
                                    ? Math.min(...items.map(i => Math.floor((i.product.stock ?? 0) / i.qty)))
                                    : 0;
                            }
                            const isOut = effectiveStock <= 0;
                            const isDisabled = isOut && !allowNegativeStock;
                            const CatIcon = CATEGORY_ICONS[p.category] || Package;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => addToCart(p)}
                                    disabled={isDisabled}
                                    className={`group relative flex flex-col text-left p-2.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-emerald-300 hover:shadow-md transition-all active:scale-[0.98] ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                    {/* Badge flotante de stock */}
                                    <span className={`absolute top-2 right-2 text-[9px] font-extrabold px-2 py-0.5 rounded-full z-10 border shadow-sm ${isOut
                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200'
                                        : 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200/60'
                                        }`}>
                                        {isOut ? 'AGOTADO' : `${p.isWeight ? (effectiveStock ?? 0).toFixed(2) : effectiveStock} ${p.isWeight ? 'KG' : 'UNDS'}`}
                                    </span>

                                    {/* Imagen protagonista */}
                                    <div className="relative w-full aspect-square flex items-center justify-center pt-2 pb-1 overflow-hidden group-hover:scale-[1.03] transition-transform">
                                        <CatIcon size={28} className={`absolute text-slate-300 dark:text-slate-700 ${p.image && !brokenImages[p.id] ? 'opacity-0' : ''}`} />
                                        {p.image && !brokenImages[p.id] && (
                                            <img
                                                src={p.image}
                                                loading="lazy"
                                                alt={p.name}
                                                className="relative w-full h-full object-contain"
                                                onError={handleImageError(p.id)}
                                            />
                                        )}
                                    </div>

                                    {/* Nombre a 2 líneas con altura fija */}
                                    <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 mt-1 mb-1.5 min-h-[2.4em]">{p.name}</p>

                                    {/* Doble precio: $ grande + Bs debajo */}
                                    <div className="mt-auto">
                                        <p className="text-base font-black text-slate-900 dark:text-white leading-none">
                                            ${p.priceUsdt?.toFixed(2)}
                                        </p>
                                        <p className="text-[11px] font-bold text-teal-600 dark:text-teal-400 leading-none mt-1">
                                            Bs {formatBs((p.priceUsdt || 0) * (effectiveRate || 0))}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Cargar más */}
                    {hasMore && (
                        <div className="flex justify-center mt-3">
                            <button
                                onClick={() => { triggerHaptic && triggerHaptic(); setVisibleCount(prev => prev + PAGE_SIZE); }}
                                className="flex items-center gap-1.5 px-5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all active:scale-95 shadow-sm"
                            >
                                <ChevronDown size={14} />
                                Cargar Mas ({filteredByCategory.length - visibleCount} restantes)
                            </button>
                        </div>
                    )}

                    {filteredByCategory.length === 0 && (
                        <div className="text-center py-10">
                            <Package size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                            <p className="text-xs text-slate-400 font-medium">Sin productos en esta categoria</p>
                        </div>
                    )}

                    {/* Footer de atajos */}
                    <div className="shrink-0 mt-3 flex items-center justify-center gap-3 flex-wrap py-2 border-t border-slate-100 dark:border-slate-800/60">
                        {[
                            { key: 'F2', label: 'BUSCAR' },
                            { key: 'ENTER', label: 'AGREGAR' },
                            { key: 'F4', label: 'VACIAR' },
                            { key: 'F9', label: 'COBRAR' },
                        ].map(({ key, label }) => (
                            <span key={key} className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                <kbd className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 font-mono text-slate-500 dark:text-slate-300 shadow-sm">{key}</kbd>
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
