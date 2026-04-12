import React from 'react';
import { X, Clock, Coffee, Layers, ChevronRight, Timer, MessageSquare } from 'lucide-react';
import { formatElapsedTime, calculateTimeCostBs, calculateTimeCostBsBreakdown, calculateGrandTotalBs, calculateSessionCostBreakdown } from '../../utils/tableBillingEngine';
import { useTablesStore } from '../../hooks/store/useTablesStore';

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

function TargetIcon({size}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
    );
}

/**
 * TableBillModal — Paso 1 del flujo de cobro de mesa.
 * Muestra el desglose completo de la cuenta (tiempo + piñas + consumos).
 * Soporta modo mixto (piña + hora simultáneamente).
 */
export default function TableBillModal({ data, onClose, onProceedToPayment }) {
    const { table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal } = data;
    const config = useTablesStore(state => state.config);
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const tasaUSD = useBcvRate();

    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;
    const breakdown = calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset);
    const isMixed = breakdown.hasPinas && breakdown.hasHours;

    const grandTotalBs = calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD, breakdown);

    // Helper: piña count depends on game mode
    const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;

    // Header subtitle
    const headerParts = [];
    if (breakdown.hasPinas) {
        headerParts.push(`${pinaCount} piña(s)`);
    }
    if (breakdown.hasHours) {
        headerParts.push(`${formatElapsedTime(elapsed)} de sesión`);
    }
    if (headerParts.length === 0) {
        headerParts.push(session.game_mode === 'PINA' ? `${pinaCount} piña(s)` : `${formatElapsedTime(elapsed)} de sesión`);
    }

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
                            {headerParts.join(' · ')}
                            {isMixed && <span className="text-amber-500 font-bold ml-1">MIXTO</span>}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Nota de mesa ──────────────────────────── */}
                {session?.notes && (
                    <div className="shrink-0 mx-4 mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700/40 rounded-xl">
                        <MessageSquare size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{session.notes}</p>
                    </div>
                )}

                {/* ── Scrollable body ─────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

                    {/* Piñas — visible si la sesión tiene piñas */}
                    {breakdown.hasPinas && breakdown.pinaCost > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-100 dark:border-amber-900/30">
                                <TargetIcon size={13} />
                                <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                    Piñas jugadas
                                </p>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-white">
                                        {pinaCount} piña{pinaCount !== 1 ? 's' : ''}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">${config.pricePina || 0} por piña</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-slate-800 dark:text-white">${breakdown.pinaCost.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">Bs {formatBs(calculateTimeCostBsBreakdown(breakdown.pinaCost, 0, config, tasaUSD).pinaCostBs)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tiempo de sesión — visible si la sesión tiene horas */}
                    {breakdown.hasHours && breakdown.hourCost > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-100 dark:border-blue-900/30">
                                <Clock size={13} className="text-blue-500" />
                                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                    Tiempo de Juego
                                </p>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-white">{formatElapsedTime(elapsed)}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">${config.pricePerHour || 0}/hora · {Number(session.hours_paid) || 0}h pagadas</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-slate-800 dark:text-white">${breakdown.hourCost.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">Bs {formatBs(calculateTimeCostBsBreakdown(0, breakdown.hourCost, config, tasaUSD).hourCostBs)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tiempo referencial (modo NORMAL libre, sin prepago, sin piñas) */}
                    {session.game_mode === 'NORMAL' && !breakdown.hasPinas && !breakdown.hasHours && elapsed > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800/40">
                                <Clock size={13} className="text-slate-400" />
                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Tiempo de sesión
                                </p>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-white">{formatElapsedTime(elapsed)}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Solo referencial · Sin cargo</p>
                                </div>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
                                    Gratis
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Fallback: PREPAGO sin breakdown (backward compat) */}
                    {timeCost > 0 && !breakdown.hasPinas && !breakdown.hasHours && session.game_mode !== 'NORMAL' && (
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-100 dark:border-blue-900/30">
                                <Clock size={13} className="text-blue-500" />
                                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                    Tiempo de Juego
                                </p>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-white">{formatElapsedTime(elapsed)}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Tarifa por hora</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-slate-800 dark:text-white">${timeCost.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">Bs {formatBs(calculateTimeCostBs(timeCost, session?.game_mode, config, tasaUSD))}</p>
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
                            {isMixed && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    Piñas ${breakdown.pinaCost.toFixed(2)} + Tiempo ${breakdown.hourCost.toFixed(2)}{totalConsumption > 0 ? ` + Consumos $${totalConsumption.toFixed(2)}` : ''}
                                </p>
                            )}
                            {!isMixed && timeCost > 0 && totalConsumption > 0 && (
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
