import React, { useState, useMemo } from 'react';
import { Modal } from '../Modal';
import { Search, TrendingUp, TrendingDown, Check, Package, X } from 'lucide-react';
import { showToast } from '../Toast';

export default function StockAdjustmentModal({
    isOpen, onClose, products, adjustStock, triggerHaptic,
}) {
    const [direction, setDirection] = useState('egreso'); // 'ingreso' | 'egreso'
    const [search, setSearch] = useState('');
    const [adjustments, setAdjustments] = useState({}); // { productId: qty }
    const [note, setNote] = useState('');
    const [isApplying, setIsApplying] = useState(false);

    const filteredProducts = useMemo(() => {
        const term = search.toLowerCase().trim();
        return (products || [])
            .filter(p => !p.isCombo)
            .filter(p => !term || p.name.toLowerCase().includes(term))
            .sort((a, b) => {
                const aHas = adjustments[a.id] > 0 ? 1 : 0;
                const bHas = adjustments[b.id] > 0 ? 1 : 0;
                if (aHas !== bHas) return bHas - aHas;
                return a.name.localeCompare(b.name);
            });
    }, [products, search, adjustments]);

    const activeAdjustments = useMemo(() =>
        Object.entries(adjustments).filter(([, qty]) => qty > 0),
    [adjustments]);

    const totalItems = activeAdjustments.reduce((sum, [, qty]) => sum + qty, 0);

    const setQty = (productId, val) => {
        const num = Math.max(0, parseInt(val) || 0);
        setAdjustments(prev => ({ ...prev, [productId]: num }));
    };

    const handleApply = async () => {
        if (activeAdjustments.length === 0) return;
        setIsApplying(true);
        triggerHaptic && triggerHaptic();

        try {
            for (const [productId, qty] of activeAdjustments) {
                const delta = direction === 'ingreso' ? qty : -qty;
                await adjustStock(productId, delta);
            }

            const productNames = activeAdjustments.map(([id, qty]) => {
                const p = products.find(x => x.id === id);
                return `${qty}× ${p?.name || '?'}`;
            });

            showToast(
                `${direction === 'ingreso' ? 'Ingreso' : 'Egreso'} aplicado: ${activeAdjustments.length} productos, ${totalItems} unidades`,
                'success'
            );

            // Reset
            setAdjustments({});
            setNote('');
            setSearch('');
            onClose();
        } catch (e) {
            showToast('Error al aplicar ajuste: ' + e.message, 'error');
        } finally {
            setIsApplying(false);
        }
    };

    const handleClose = () => {
        setAdjustments({});
        setSearch('');
        setNote('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Ajuste de Inventario" maxWidthClass="max-w-lg">
            <div className="flex flex-col gap-3 -mt-2">

                {/* Direction Toggle */}
                <div className="flex gap-2">
                    <button onClick={() => setDirection('ingreso')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                            direction === 'ingreso'
                                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                        <TrendingUp size={16} /> Ingreso
                    </button>
                    <button onClick={() => setDirection('egreso')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                            direction === 'egreso'
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                        <TrendingDown size={16} /> Egreso
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar producto..." value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-4 text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50" />
                </div>

                {/* Product List */}
                <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {filteredProducts.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-400">
                            <Package size={24} className="mx-auto mb-2 opacity-50" />
                            Sin resultados
                        </div>
                    ) : filteredProducts.map(p => {
                        const qty = adjustments[p.id] || 0;
                        const isActive = qty > 0;
                        return (
                            <div key={p.id} className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${isActive ? (direction === 'ingreso' ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-red-50/50 dark:bg-red-950/20') : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">
                                        Stock: <span className={`font-black ${(p.stock ?? 0) <= (p.lowStockAlert ?? 5) ? 'text-amber-500' : 'text-slate-600 dark:text-slate-300'}`}>{p.stock ?? 0}</span>
                                        {isActive && (
                                            <span className={`ml-1.5 font-black ${direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                → {direction === 'ingreso' ? (p.stock ?? 0) + qty : Math.max(0, (p.stock ?? 0) - qty)}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => setQty(p.id, qty - 1)} disabled={qty <= 0}
                                        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-red-500 disabled:opacity-30 transition-colors active:scale-90 text-lg font-bold">
                                        −
                                    </button>
                                    <input type="number" value={qty || ''} placeholder="0"
                                        onChange={(e) => setQty(p.id, e.target.value)}
                                        className="w-14 h-8 text-center text-sm font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                    <button onClick={() => setQty(p.id, qty + 1)}
                                        className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-emerald-500 transition-colors active:scale-90 text-lg font-bold">
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Note */}
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Nota / motivo (opcional)"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50" />

                {/* Summary */}
                {activeAdjustments.length > 0 && (
                    <div className={`p-3 rounded-xl border ${direction === 'ingreso' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40' : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40'}`}>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className={`text-xs font-black uppercase tracking-wider ${direction === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                Resumen de {direction}
                            </span>
                            <span className={`text-xs font-bold ${direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}`}>
                                {activeAdjustments.length} productos · {totalItems} unidades
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {activeAdjustments.slice(0, 8).map(([id, qty]) => {
                                const p = products.find(x => x.id === id);
                                return (
                                    <span key={id} className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/60 dark:bg-slate-900/40 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300">
                                        <span className={`font-black ${direction === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>{qty}×</span>
                                        {p?.name || '?'}
                                        <button onClick={() => setQty(id, 0)} className="ml-0.5 text-slate-400 hover:text-red-500"><X size={10} /></button>
                                    </span>
                                );
                            })}
                            {activeAdjustments.length > 8 && (
                                <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5">+{activeAdjustments.length - 8} más</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Apply Button */}
                <button onClick={handleApply} disabled={activeAdjustments.length === 0 || isApplying}
                    className={`w-full py-3 rounded-xl font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                        direction === 'ingreso'
                            ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                            : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
                    }`}>
                    {isApplying ? 'Aplicando...' : (
                        <>
                            <Check size={16} className="inline mr-1" />
                            Aplicar {direction === 'ingreso' ? 'Ingreso' : 'Egreso'} ({totalItems} unidades)
                        </>
                    )}
                </button>
            </div>
        </Modal>
    );
}
