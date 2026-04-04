import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, X, Plus, Minus, Trash2, Loader2, Search, ChevronDown, UtensilsCrossed } from 'lucide-react';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';

import { useAuthStore } from '../../hooks/store/authStore';

import { useProductContext } from '../../context/ProductContext';

// Category color mapping for visual variety
const CAT_COLORS = {
    bebidas: 'from-sky-500 to-blue-600',
    cervezas: 'from-amber-500 to-orange-600',
    licores: 'from-purple-500 to-violet-600',
    snacks: 'from-emerald-500 to-teal-600',
    comida: 'from-rose-500 to-pink-600',
    tabacos: 'from-stone-500 to-stone-700',
    default: 'from-slate-500 to-slate-700',
};

function getCatColor(category) {
    if (!category) return CAT_COLORS.default;
    const key = category.toLowerCase();
    return Object.entries(CAT_COLORS).find(([k]) => key.includes(k))?.[1] || CAT_COLORS.default;
}

export function OrderPanel({ session, table, onClose }) {
    const { addItemToSession, deleteItem, updateItemQty, syncOrders } = useOrdersStore();
    const allOrders = useOrdersStore(state => state.orders);
    const allItems = useOrdersStore(state => state.orderItems);
    const { currentUser } = useAuthStore();
    const { products, isLoadingProducts: loadingProducts, effectiveRate } = useProductContext();

    const [addingItem, setAddingItem] = useState(null);
    const [removingItem, setRemovingItem] = useState(null);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('Todos');
    const [qtyModalItem, setQtyModalItem] = useState(null);
    const [qtyInputValue, setQtyInputValue] = useState(1);
    const searchRef = useRef(null);

    // Derive order and items
    const order = allOrders.find(o => o.table_session_id === session.id) || null;
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumed = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);

    // Categories derived from products
    const categories = ['Todos', ...new Set(products.map(p => p.category).filter(Boolean))];

    // Filtered products
    const filteredProducts = products.filter(p => {
        const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
        const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
        return matchSearch && matchCat;
    });

    useEffect(() => {
        syncOrders();
    }, []);

    const handleAddProduct = async (product) => {
        if (!currentUser || addingItem) return;
        setAddingItem(product.id);
        const productForOrder = {
            id: product.id,
            name: product.name,
            price: product.priceUsdt || product.priceUsd || product.price || 0
        };
        try {
            await addItemToSession(table.id, session.id, currentUser.id, productForOrder, effectiveRate);
        } catch (e) {
            console.error(e);
        } finally {
            setTimeout(() => setAddingItem(null), 300);
        }
    };

    const handleRemoveItem = async (itemId) => {
        setRemovingItem(itemId);
        await deleteItem(itemId);
        setRemovingItem(null);
    };

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] z-50 flex flex-col bg-slate-50 shadow-2xl">

            {/* ── HEADER ── */}
            <div className="px-5 pt-6 pb-4 flex justify-between items-start shrink-0">
                <div>
                    <div className="flex items-center gap-2.5 mb-0.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md shadow-indigo-500/30">
                            <ShoppingBag size={16} className="text-white" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">Consumo</h2>
                    </div>
                    <p className="text-sm text-slate-500 font-medium ml-10">{table.name}</p>
                </div>
                <button onClick={onClose}
                    className="w-9 h-9 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all active:scale-90 mt-1">
                    <X size={18} />
                </button>
            </div>

            {/* ── ORDER ITEMS SECTION ── */}
            <div className="px-5 mb-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
                        En la mesa · {currentItems.length} {currentItems.length === 1 ? 'item' : 'items'}
                    </span>
                    {totalConsumed > 0 && (
                        <span className="text-emerald-400 font-black text-lg tabular-nums">
                            ${totalConsumed.toFixed(2)}
                        </span>
                    )}
                </div>

                {currentItems.length === 0 ? (
                    <div className="flex items-center gap-3 py-4 px-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <UtensilsCrossed size={20} className="text-slate-400 shrink-0" />
                        <p className="text-sm text-slate-500 font-medium">Sin productos aún. Añade del menú abajo.</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                        {currentItems.map(item => (
                            <div key={item.id}
                                className={`flex items-center gap-3 bg-white border border-slate-200 shadow-sm rounded-2xl px-4 py-3 transition-all duration-300 ${removingItem === item.id ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                                {/* Editable Qty badge */}
                                <button 
                                    onClick={() => {
                                        setQtyModalItem(item);
                                        setQtyInputValue(item.qty);
                                    }}
                                    className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 hover:bg-indigo-200 hover:scale-105 active:scale-95 transition-all shadow-sm group"
                                >
                                    <span className="text-indigo-700 font-black text-sm group-hover:hidden">{item.qty}</span>
                                    <span className="text-indigo-700 font-black text-lg hidden group-hover:block">#</span>
                                </button>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-slate-800 font-bold text-sm truncate">{item.product_name}</div>
                                    <div className="text-slate-500 text-xs font-medium">
                                        ${Number(item.unit_price_usd).toFixed(2)} c/u · <span className="text-emerald-500 font-bold">${(Number(item.unit_price_usd) * Number(item.qty)).toFixed(2)}</span>
                                        <span className="ml-2 text-[10px] text-slate-400">({(Number(item.unit_price_usd) * (order?.exchange_rate_used || effectiveRate || 1)).toFixed(2)} Bs)</span>
                                    </div>
                                </div>
                                {/* Controls */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleAddProduct({ id: item.product_id, name: item.product_name, price: item.unit_price_usd })}
                                        disabled={!!addingItem}
                                        className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40">
                                        <Plus size={14} />
                                    </button>
                                    <button onClick={() => handleRemoveItem(item.id)}
                                        className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center transition-all active:scale-90">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── DIVIDER ── */}
            <div className="mx-5 border-t border-slate-200 mb-4 shrink-0" />

            {/* ── MENU SECTION ── */}
            <div className="flex flex-col flex-1 min-h-0 px-5">
                {/* Search bar */}
                <div className="relative mb-3 shrink-0">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar producto..."
                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
                    />
                </div>

                {/* Category pills */}
                {categories.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-3 shrink-0 no-scrollbar">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setActiveCategory(cat)}
                                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    activeCategory === cat
                                        ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30 border border-indigo-500'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                }`}>
                                {cat}
                            </button>
                        ))}
                    </div>
                )}

                {/* Product grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingProducts ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 size={28} className="animate-spin text-indigo-400" />
                            <span className="text-sm text-slate-500">Cargando menú...</span>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">
                            <p className="text-sm font-medium">Sin resultados para "{search}"</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2.5 pb-4">
                            {filteredProducts.map(p => {
                                const inOrder = currentItems.find(i => i.product_id === p.id);
                                const isAdding = addingItem === p.id;
                                return (
                                    <button key={p.id}
                                        onClick={() => handleAddProduct(p)}
                                        disabled={isAdding}
                                        className={`relative text-left rounded-2xl p-3.5 border transition-all active:scale-95 group overflow-hidden ${
                                            inOrder
                                                ? 'bg-indigo-50 border-indigo-200 shadow-sm shadow-indigo-100'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md shadow-sm'
                                        } ${isAdding ? 'opacity-60' : ''}`}>
                                        {/* Category accent dot */}
                                        <div className={`w-2 h-2 rounded-full mb-2.5 bg-gradient-to-br ${getCatColor(p.category)}`} />
                                        <div className="font-bold text-slate-800 text-sm leading-tight mb-1 line-clamp-2">{p.name}</div>
                                        {p.category && (
                                            <div className="text-[10px] text-slate-400 mb-2">{p.category}</div>
                                        )}
                                        <div className="flex items-center justify-between mt-auto">
                                            <span className="text-emerald-500 font-black text-sm">${Number(p.priceUsdt || p.priceUsd || p.price || 0).toFixed(2)}</span>
                                            {effectiveRate > 0 && (
                                                <span className="text-[10px] text-slate-500 font-medium ml-2">
                                                    {(Number(p.priceUsdt || p.priceUsd || p.price || 0) * effectiveRate).toFixed(2)} Bs
                                                </span>
                                            )}
                                            {inOrder && (
                                                <span className="text-[10px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded-full">
                                                    x{inOrder.qty}
                                                </span>
                                            )}
                                        </div>
                                        {/* Add indicator */}
                                        <div className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                            isAdding ? 'bg-indigo-500' : 'bg-transparent group-hover:bg-slate-100'
                                        }`}>
                                            {isAdding
                                                ? <Loader2 size={10} className="animate-spin text-white" />
                                                : <Plus size={10} className="text-slate-300 group-hover:text-slate-600" />
                                            }
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── QTY MODAL ── */}
            {qtyModalItem && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setQtyModalItem(null)} />
                    
                    {/* Modal Content */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200 text-center relative z-10 text-slate-800">
                        <div className="w-12 h-12 mx-auto bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 rounded-2xl flex items-center justify-center mb-3">
                            <ShoppingBag size={24} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-0.5 line-clamp-1">
                            {qtyModalItem.product_name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                            Modifica la cantidad en la orden
                        </p>
                        
                        <div className="flex items-center justify-center gap-3 mb-6">
                            <button onClick={() => setQtyInputValue(Math.max(1, qtyInputValue - 1))} className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-2xl flex items-center justify-center transition-all active:scale-95">
                                -
                            </button>
                            <input
                                type="number"
                                min="1"
                                className="w-24 bg-slate-50 border-2 border-slate-200 rounded-2xl text-center text-3xl font-black text-indigo-600 focus:border-indigo-500 focus:ring-0 py-2.5 transition-all shadow-inner"
                                value={qtyInputValue}
                                onChange={e => setQtyInputValue(parseInt(e.target.value) || 1)}
                                onFocus={e => e.target.select()}
                                autoFocus
                            />
                            <button onClick={() => setQtyInputValue(qtyInputValue + 1)} className="w-12 h-12 rounded-2xl bg-indigo-100 hover:bg-indigo-200 text-indigo-600 font-black text-2xl flex items-center justify-center transition-all active:scale-95">
                                +
                            </button>
                        </div>
                        
                        {/* Quick presets */}
                        <div className="grid grid-cols-3 gap-2 mb-6">
                            {[6, 12, 24].map(preset => (
                                <button key={preset} onClick={() => setQtyInputValue(preset)} className="py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 active:bg-slate-200 text-slate-600 font-bold text-sm transition-colors cursor-pointer">
                                    {preset} un
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setQtyModalItem(null)} className="flex-1 py-3.5 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition-all active:scale-95">
                                Cancelar
                            </button>
                            <button 
                                onClick={async () => {
                                    try {
                                        await updateItemQty(qtyModalItem.id, qtyInputValue);
                                    } catch(e) { /* ignore update errors */ }
                                    setQtyModalItem(null);
                                }}
                                className="flex-1 py-3.5 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-95 transition-all shadow-md shadow-indigo-500/20"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── BOTTOM SAFE AREA ── */}
            <div className="h-safe-bottom shrink-0" />
        </div>
    );
}
