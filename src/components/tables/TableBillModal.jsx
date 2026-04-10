import React from 'react';
import { X, Clock, Coffee, Layers, ChevronRight, Timer } from 'lucide-react';
import { formatElapsedTime } from '../../utils/tableBillingEngine';

function formatBs(val) {
    return (val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useBcvRate() {
    try {
        const useAuto = JSON.parse(localStorage.getItem('bodega_use_auto_rate') ?? 'true');
        if (!useAuto) {
            const manual = parseFloat(localStorage.getItem('bodega_custom_rate'));
            if (manual > 0) return manual;
        }
        const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
        return saved?.bcv?.price || 1;
    } catch { return 1; }
}

/**
 * TableBillModal — Paso 1 del flujo de cobro de mesa.
 * Muestra el desglose completo de la cuenta (tiempo + consumos).
 * El cajero revisa con el cliente antes de proceder al pago.
 */
export default function TableBillModal({ data, onClose, onProceedToPayment }) {
    const { table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal } = data;
    const tasaUSD = useBcvRate();
    const grandTotalBs = grandTotal * tasaUSD;

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-950 w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '92dvh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ─────────────────────────────────── */}
                <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25">
                        <Layers size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-black text-slate-800 dark:text-white text-lg leading-tight">{table.name}</h2>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Timer size={11} />
                            {session.game_mode === 'PINA'
                                ? `${1 + (Number(session.extended_times) || 0)} piña(s) · La Piña`
                                : `${formatElapsedTime(elapsed)} de sesión`}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Scrollable body ─────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

                    {/* Tiempo de juego */}
                    {timeCost > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-100 dark:border-blue-900/30">
                                <Clock size={13} className="text-blue-500" />
                                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                    {session.game_mode === 'PINA' ? 'Piñas jugadas' : 'Tiempo de Juego'}
                                </p>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    {session.game_mode === 'PINA' ? (
                                        <>
                                            <p className="text-sm font-bold text-slate-700 dark:text-white">
                                                {1 + (Number(session.extended_times) || 0)} piña{(1 + (Number(session.extended_times) || 0)) !== 1 ? 's' : ''}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">Precio fijo por piña</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm font-bold text-slate-700 dark:text-white">{formatElapsedTime(elapsed)}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">Tarifa por hora</p>
                                        </>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-slate-800 dark:text-white">${timeCost.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">Bs {formatBs(timeCost * tasaUSD)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Consumos */}
                    {currentItems && currentItems.length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-100 dark:border-amber-900/30">
                                <Coffee size={13} className="text-amber-500" />
                                <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                    Consumos ({currentItems.length} {currentItems.length === 1 ? 'artículo' : 'artículos'})
                                </p>
                            </div>
                            <div className="divide-y divide-amber-100 dark:divide-amber-900/20">
                                {currentItems.map((item, i) => {
                                    const lineTotal = Number(item.unit_price_usd) * Number(item.qty);
                                    return (
                                        <div key={i} className="flex items-center justify-between px-4 py-3">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <span className="w-7 h-7 bg-amber-200 dark:bg-amber-800/60 rounded-lg flex items-center justify-center text-[11px] font-black text-amber-700 dark:text-amber-300 shrink-0">
                                                    {item.qty}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-700 dark:text-white truncate">
                                                        {item.product_name || item.name}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">
                                                        ${Number(item.unit_price_usd).toFixed(2)} c/u
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 pl-3">
                                                <p className="text-sm font-black text-slate-800 dark:text-white">${lineTotal.toFixed(2)}</p>
                                                <p className="text-[10px] text-slate-400">Bs {formatBs(lineTotal * tasaUSD)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Sin consumos */}
                    {(!currentItems || currentItems.length === 0) && timeCost === 0 && (
                        <div className="py-8 text-center text-slate-400">
                            <Coffee size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Sin consumos registrados</p>
                        </div>
                    )}

                    {/* Total */}
                    <div
                        className="rounded-2xl p-4 flex items-center justify-between"
                        style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                    >
                        <div>
                            <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Total a Cobrar</p>
                            {timeCost > 0 && totalConsumption > 0 && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    Tiempo ${timeCost.toFixed(2)} + Consumos ${totalConsumption.toFixed(2)}
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-white">${grandTotal.toFixed(2)}</p>
                            <p className="text-xs font-bold text-white/70">Bs {formatBs(grandTotalBs)}</p>
                        </div>
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────── */}
                <div className="shrink-0 px-4 pb-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                        Cerrar
                    </button>
                    <button
                        onClick={onProceedToPayment}
                        className="flex-[2] py-3.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/25"
                        style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                    >
                        Cobrar
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
