import React from 'react';
import { Users } from 'lucide-react';

export function BillSeatBreakdown({
    seatBreakdown, seats, unpaidSeatsCount,
    sharedDivisionType, setSharedDivisionType,
    customSharedAmounts, setCustomSharedAmounts,
    customDivisionMismatch,
    onProceedToPayment, discount, itemDiscounts,
}) {
    return (
        <>
            {seatBreakdown.seats.map((sb, idx) => {
                const seat = sb.seat;
                const label = seat.label || `Cliente ${idx + 1}`;
                return (
                    <div key={seat.id} className={`border rounded-2xl overflow-hidden ${seat.paid ? 'opacity-50 bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700' : 'bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/40'}`}>
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
                            <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${seat.paid ? 'bg-emerald-200 text-emerald-700' : 'bg-sky-500 text-white'}`}>
                                    {label.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-black text-slate-800 dark:text-white">{label}</span>
                                {seat.paid && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">PAGADO</span>}
                            </div>
                            <span className="text-base font-black text-slate-800 dark:text-white">${sb.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="px-4 py-2 space-y-1 text-xs">
                            {/* Cargos de tiempo individuales */}
                            {seat.timeCharges && seat.timeCharges.length > 0 && sb.timeCost.total > 0 && (
                                <>
                                    {seat.timeCharges.filter(tc => tc.type === 'hora').length > 0 && (
                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                            <span>Horas ({seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + tc.amount, 0)}h)</span>
                                            <span className="font-bold">${sb.timeCost.hourCost?.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {seat.timeCharges.filter(tc => tc.type === 'pina').length > 0 && (
                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                            <span>Piñas ({seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + tc.amount, 0)})</span>
                                            <span className="font-bold">${sb.timeCost.pinaCost?.toFixed(2)}</span>
                                        </div>
                                    )}
                                </>
                            )}
                            {/* Legacy: tiempo por gameMode */}
                            {(!seat.timeCharges || seat.timeCharges.length === 0) && sb.timeCost.total > 0 && (
                                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                    <span>Tiempo</span>
                                    <span className="font-bold">${sb.timeCost.total.toFixed(2)}</span>
                                </div>
                            )}
                            {sb.consumption > 0 && (
                                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                    <span>Consumo ({sb.items.length} {sb.items.length === 1 ? 'item' : 'items'})</span>
                                    <span className="font-bold">${sb.consumption.toFixed(2)}</span>
                                </div>
                            )}
                            {sb.sharedPortion > 0 && (
                                <div className="flex justify-between text-slate-400">
                                    <span>Compartido ({sharedDivisionType === 'equal' ? `÷${seatBreakdown.seats.filter(s => !s.seat.paid).length}` : 'manual'})</span>
                                    <span className="font-bold">${sb.sharedPortion.toFixed(2)}</span>
                                </div>
                            )}
                            {sb.timeCost.total === 0 && sb.consumption === 0 && sb.sharedPortion === 0 && !seat.paid && (
                                <p className="text-slate-400 py-1">Sin cargos individuales</p>
                            )}
                        </div>
                        {!seat.paid && (
                            <div className="px-4 pb-3">
                                <button
                                    disabled={customDivisionMismatch}
                                    onClick={() => onProceedToPayment(discount, itemDiscounts, seat.id, sb.subtotal)}
                                    className={`w-full py-2 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all ${customDivisionMismatch ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    style={{ background: customDivisionMismatch ? '#94a3b8' : 'linear-gradient(135deg, #F97316, #EA580C)' }}
                                >
                                    Cobrar {label} — ${sb.subtotal.toFixed(2)}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Sección Compartido */}
            {seatBreakdown.sharedTotal > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                            <Users size={12} className="text-slate-400" />
                            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Compartido · ${seatBreakdown.sharedTotal.toFixed(2)}
                            </p>
                        </div>
                        {/* Toggle división — solo si hay 2+ asientos sin pagar */}
                        {unpaidSeatsCount > 1 && (
                        <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 rounded-lg p-0.5">
                            <button
                                onClick={() => setSharedDivisionType('equal')}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${sharedDivisionType === 'equal' ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400'}`}
                            >
                                Igual
                            </button>
                            <button
                                onClick={() => setSharedDivisionType('custom')}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${sharedDivisionType === 'custom' ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400'}`}
                            >
                                Manual
                            </button>
                        </div>
                        )}
                    </div>
                    {/* Tiempo compartido (session-level) */}
                    {seatBreakdown.sharedTimeTotal > 0 && (
                        <div className="px-4 pt-2 pb-1">
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Tiempo de sesión</span>
                                <span className="font-bold">${seatBreakdown.sharedTimeTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                    {/* Items compartidos */}
                    {seatBreakdown.sharedItems.length > 0 && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {seatBreakdown.sharedItems.map((item, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-black text-slate-500 flex items-center justify-center">{item.qty}</span>
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{item.product_name}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 dark:text-white">${(Number(item.unit_price_usd) * Number(item.qty)).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* División manual: inputs por cliente */}
                    {sharedDivisionType === 'custom' && (
                        <div className="px-4 py-3 space-y-2 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Asignar monto compartido</p>
                            {seatBreakdown.seats.filter(s => !s.seat.paid).map(sb => (
                                <div key={sb.seat.id} className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-24 truncate">{sb.seat.label || `Cliente`}</span>
                                    <div className="flex-1 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
                                        <span className="text-slate-400 text-xs mr-1">$</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="0.01"
                                            placeholder={(seatBreakdown.sharedPerSeat).toFixed(2)}
                                            value={customSharedAmounts[sb.seat.id] ?? ''}
                                            onChange={e => setCustomSharedAmounts(prev => ({ ...prev, [sb.seat.id]: parseFloat(e.target.value) || 0 }))}
                                            className="flex-1 bg-transparent text-xs font-bold text-slate-700 dark:text-white outline-none"
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                                <span>Total asignado</span>
                                <span className={`font-bold ${Math.abs(Object.values(customSharedAmounts).reduce((s, v) => s + v, 0) - seatBreakdown.sharedTotal) < 0.01 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    ${Object.values(customSharedAmounts).reduce((s, v) => s + v, 0).toFixed(2)} / ${seatBreakdown.sharedTotal.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}
                    {sharedDivisionType === 'equal' && (
                        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400">
                            ÷{seatBreakdown.seats.filter(s => !s.seat.paid).length} clientes = ${seatBreakdown.sharedPerSeat.toFixed(2)} c/u
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
