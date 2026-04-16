import React from 'react';
import { formatElapsedTime, calculateTimeCostBs, calculateTimeCostBsBreakdown, calculateGrandTotalBs } from '../../utils/tableBillingEngine';
import { Modal } from '../Modal';

export function TotalDetailsModal({
    isOpen, onClose,
    table, session, elapsed,
    timeCost, totalConsumption, grandTotal,
    costBreakdown, config, tasaUSD,
    currentItems,
}) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalle de Cuenta">
             <div className="flex flex-col gap-3 py-4 text-slate-800 dark:text-white max-h-[70vh] overflow-y-auto">
                {/* Piñas */}
                {table?.type !== 'NORMAL' && costBreakdown?.hasPinas && (
                <div className="flex flex-col p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Piñas jugadas</span>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black">${(costBreakdown.pinaCost || 0).toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400">
                                Bs. {calculateTimeCostBsBreakdown(costBreakdown.pinaCost, 0, config, tasaUSD).pinaCostBs.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400/70">
                        {session?.game_mode === 'PINA' ? 1 + (Number(session?.extended_times) || 0) : Number(session?.extended_times) || 0} piña(s) · ${config.pricePina || 0} c/u
                    </span>
                </div>
                )}

                {/* Tiempo */}
                {table?.type !== 'NORMAL' && costBreakdown?.hasHours && (
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tiempo de Juego</span>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black">${(costBreakdown.hourCost || 0).toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400">
                                Bs. {calculateTimeCostBsBreakdown(0, costBreakdown.hourCost, config, tasaUSD).hourCostBs.toFixed(2)}
                            </span>
                        </div>
                    </div>
                    <span className="text-xs text-slate-500">
                        {formatElapsedTime(elapsed)} · {Number(session?.hours_paid) || 0}h pagadas
                    </span>
                </div>
                )}

                {/* Fallback */}
                {table?.type !== 'NORMAL' && !costBreakdown?.hasPinas && !costBreakdown?.hasHours && timeCost > 0 && (
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tiempo de Juego</span>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black">${timeCost.toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400">Bs. {calculateTimeCostBs(timeCost, session?.game_mode, config, tasaUSD).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                )}

                {/* Consumos Detallados */}
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200/50 dark:border-white/5">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Consumo en Mesa</span>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black">${totalConsumption.toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400">Bs. {(totalConsumption * tasaUSD).toFixed(2)}</span>
                        </div>
                    </div>
                    {currentItems.length > 0 ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                            {currentItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-start text-sm">
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-1">{item.qty}x</span>
                                        {item.product_name}
                                    </span>
                                    <div className="flex flex-col items-end shrink-0 ml-2">
                                        <span className="font-bold text-slate-800 dark:text-white">${(item.qty * item.unit_price_usd).toFixed(2)}</span>
                                        <span className="text-[10px] text-slate-400">Bs. {(item.qty * item.unit_price_usd * tasaUSD).toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400 italic">No hay consumos registrados</span>
                    )}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center mt-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <div className="flex flex-col">
                        <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Total Cuenta</span>
                        <span className="text-xs font-bold text-emerald-600/70 dark:text-emerald-400/70 pt-1">Tasa BCV: Bs. {Number(tasaUSD).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none mb-1">
                            ${grandTotal.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-emerald-600/80 dark:text-emerald-400/80">
                            Bs. {calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD, costBreakdown).toFixed(2)}
                        </span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors"
                >
                    Cerrar Detalle
                </button>
            </div>
        </Modal>
    );
}
