import React from 'react';
import { Tag, Banknote, AlertTriangle, Box, Minus, Plus, Pencil, Trash2, Package, Layers } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_ICONS, UNITS } from '../../config/categories';
import { formatUsd, formatBs, smartCashRounding } from '../../utils/calculatorUtils';

export default function ProductCard({
    product: p,
    effectiveRate,
    streetRate,
    categories,
    onAdjustStock,

    onEdit,
    onDelete
}) {
    const valBs = p.priceUsdt * effectiveRate;
    const isLowStock = (p.stock ?? 0) <= (p.lowStockAlert ?? 5);
    const margin = p.costBs > 0 ? ((valBs - p.costBs) / p.costBs * 100) : null;
    const catInfo = categories.find(c => c.id === p.category);
    const unitInfo = UNITS.find(u => u.id === p.unit);
    const efectivoPrecio = streetRate > 0 ? `$${smartCashRounding(valBs / streetRate)}` : null;

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border flex flex-col overflow-hidden group ${isLowStock ? 'border-amber-300 dark:border-amber-700' : 'border-slate-100 dark:border-slate-800'
            }`}>
            {/* Image */}
            <div className="w-full h-24 bg-slate-100 dark:bg-slate-800 overflow-hidden relative shrink-0">
                {p.image ? (
                    <img src={p.image} className="w-full h-full object-contain p-1" alt={p.name} loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                        <Tag size={24} />
                    </div>
                )}
                {/* Category badge */}
                {catInfo && catInfo.id !== 'otros' && (
                    <div className={`absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${CATEGORY_COLORS[catInfo.color] || ''}`}>
                        {(() => { const CatIcon = CATEGORY_ICONS[catInfo.id]; return CatIcon ? <CatIcon size={9} /> : catInfo.icon; })()} {catInfo.label}
                    </div>
                )}
                {/* Low stock alert */}
                {isLowStock && (
                    <div className="absolute top-1 right-1 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <AlertTriangle size={9} /> Bajo
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3 flex flex-col flex-1">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 text-[13px] leading-tight line-clamp-2 mb-2">{p.name}</h3>

                {/* Units per package info */}
                {p.unit === 'paquete' && p.unitsPerPackage && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mb-2 mt-[-4px]">
                        <Package size={11} /> Lote · {p.unitsPerPackage} uds
                    </div>
                )}

                <div className="flex justify-between items-end mb-3">
                    <div>
                        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">
                            {formatUsd(p.priceUsdt)} <span className="text-[10px] font-bold text-emerald-600/50 dark:text-emerald-400/50">USD {(p.unit === 'kg' || p.unit === 'litro') ? `/ ${unitInfo?.short || 'ud'}` : ''}</span>
                        </p>
                        <p className="text-[11px] font-bold text-slate-400 mt-1">{formatBs(valBs)} Bs</p>
                        {p.unit === 'paquete' && p.sellByUnit && (
                            <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mt-0.5 flex items-center gap-0.5">
                                <Layers size={10} />
                                ${(p.unitPriceUsd ?? p.priceUsdt / (p.unitsPerPackage || 1)).toFixed(2)} / ud
                            </p>
                        )}
                    </div>
                    {margin !== null && (
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${margin >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                            {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                        </span>
                    )}
                </div>

                {/* Stock Control Prominente */}
                <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl p-1">
                        <button onClick={() => onAdjustStock(p.id, -1)} className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm active:scale-95 transition-all">
                            <Minus size={18} strokeWidth={2.5} />
                        </button>
                        <div className="flex flex-col items-center justify-center px-2 text-center min-w-[50px]">
                            <span className={`text-base font-black leading-none mb-0.5 ${isLowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                {p.stock ?? 0}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">{(p.unit === 'kg' || p.unit === 'litro') ? unitInfo?.short : 'UND'}</span>
                            {p.unit === 'paquete' && p.unitsPerPackage > 0 && Math.floor((p.stock ?? 0) / p.unitsPerPackage) > 0 && (
                                <span className="text-[8px] text-slate-400 leading-none">= {Math.floor((p.stock ?? 0) / p.unitsPerPackage)} lotes</span>
                            )}
                        </div>
                        <button onClick={() => onAdjustStock(p.id, 1)} className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-emerald-500 shadow-sm active:scale-95 transition-all">
                            <Plus size={18} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex border-t border-slate-100 dark:border-slate-800">

                <button onClick={() => onEdit(p)} className="flex-1 py-1.5 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-amber-500 transition-colors"><Pencil size={12} /></button>
                <button onClick={() => onDelete(p.id)} className="flex-1 py-1.5 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"><Trash2 size={12} /></button>
            </div>
        </div >
    );
}
