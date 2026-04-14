import React, { useState, useEffect } from 'react';
import { X, Clock, Coffee, Layers, ChevronRight, Timer, MessageSquare, Percent, Tag, Trash2, Users, Target } from 'lucide-react';
import { formatElapsedTime, calculateTimeCostBs, calculateTimeCostBsBreakdown, calculateGrandTotalBs, calculateSessionCostBreakdown, formatHoursPaid, calculateFullTableBreakdown } from '../../utils/tableBillingEngine';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useProductContext } from '../../context/ProductContext';
import DiscountModal from '../Sales/DiscountModal';

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
    const { currentUser } = useAuthStore();
    const { effectiveRate } = useProductContext();
    const canDiscount = currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO';

    const [discount, setDiscount] = useState({ type: 'percentage', value: 0 });
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [itemDiscounts, setItemDiscounts] = useState({});
    const [discountPopoverItem, setDiscountPopoverItem] = useState(null);
    const [discountCustomValue, setDiscountCustomValue] = useState('');
    const [payingSeatId, setPayingSeatId] = useState(null);
    // División de compartido: 'equal' | 'custom'
    const [sharedDivisionType, setSharedDivisionType] = useState('equal');
    const [customSharedAmounts, setCustomSharedAmounts] = useState({});

    // Seats mode
    const seats = session?.seats || [];
    const hasSeats = seats.length > 0;
    // G: Congelar el número de divisor al abrir el modal para que no cambie al pagar un asiento
    const [frozenActiveCount] = useState(() => {
        const active = seats.filter(s => !s.paid).length;
        return active || 1;
    });
    const unpaidSeatsCount = seats.filter(s => !s.paid).length;
    // I: Resetear a 'equal' cuando queda 1 solo asiento sin pagar
    useEffect(() => {
        if (unpaidSeatsCount <= 1) setSharedDivisionType('equal');
    }, [unpaidSeatsCount]);
    const sharedDivision = sharedDivisionType === 'equal'
        ? { type: 'equal' }
        : { type: 'custom', amounts: customSharedAmounts };
    const seatBreakdown = hasSeats ? calculateFullTableBreakdown(session, seats, elapsed, config, currentItems, sharedDivision, frozenActiveCount) : null;
    // H: Bloquear cobro si división manual no suma correctamente
    const customDivisionMismatch = seatBreakdown && sharedDivisionType === 'custom' &&
        Math.abs(Object.values(customSharedAmounts).reduce((s, v) => s + v, 0) - seatBreakdown.sharedTotal) >= 0.01;
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;
    const breakdown = calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset);
    // Full breakdown (sin offsets) para mostrar totales completos
    const fullBreakdown = calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, 0, 0);
    const isMixed = fullBreakdown.hasPinas && fullBreakdown.hasHours;

    const grandTotalBs = calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD, breakdown);

    // Item discounts: recalculate consumption total
    const itemDiscountTotal = (currentItems || []).reduce((acc, item) => {
        const disc = itemDiscounts[item.id];
        if (!disc || disc.value <= 0) return acc;
        const lineTotal = Number(item.unit_price_usd) * Number(item.qty);
        return acc + (disc.type === 'percentage' ? lineTotal * (disc.value / 100) : Math.min(disc.value * Number(item.qty), lineTotal));
    }, 0);
    const adjustedConsumption = totalConsumption - itemDiscountTotal;

    // Grand total with item discounts applied
    const subtotalAfterItems = grandTotal - itemDiscountTotal;

    // Total discount (applied on top of item discounts)
    const discountAmountUsd = discount.value > 0
        ? (discount.type === 'percentage' ? subtotalAfterItems * (discount.value / 100) : Math.min(discount.value, subtotalAfterItems))
        : 0;
    const finalTotal = subtotalAfterItems - discountAmountUsd;
    const finalTotalBs = finalTotal * tasaUSD;

    // Helper: piña count depends on game mode
    const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;

    // Header subtitle
    const headerParts = [];
    if (fullBreakdown.hasPinas) {
        headerParts.push(`${pinaCount} piña(s)`);
    }
    if (fullBreakdown.hasHours) {
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

                    {/* ═══ SEATS MODE: Per-client breakdown ═══ */}
                    {hasSeats && seatBreakdown && (
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
                    )}

                    {/* ═══ CLASSIC MODE: Session-level breakdown (when no seats) ═══ */}
                    {!hasSeats && (<>

                    {/* Piñas — visible si la sesión tiene piñas */}
                    {fullBreakdown.hasPinas && (
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
                                    <p className="text-base font-black text-slate-800 dark:text-white">${fullBreakdown.pinaCost.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">Bs {formatBs(calculateTimeCostBsBreakdown(fullBreakdown.pinaCost, 0, config, tasaUSD).pinaCostBs)}</p>
                                </div>
                            </div>
                            {roundsOffset > 0 && (
                                <div className="flex items-center justify-between px-4 py-2 border-t border-amber-100 dark:border-amber-900/30 bg-amber-100/40 dark:bg-amber-900/20">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Pagado ({roundsOffset} piña{roundsOffset !== 1 ? 's' : ''})</p>
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">-${(roundsOffset * (config.pricePina || 0)).toFixed(2)}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tiempo de sesión — visible si la sesión tiene horas */}
                    {fullBreakdown.hasHours && (
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
                                    <p className="text-[10px] text-slate-400 mt-0.5">${config.pricePerHour || 0}/hora · {formatHoursPaid(Number(session.hours_paid) || 0)} pagadas</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-base font-black text-slate-800 dark:text-white">${fullBreakdown.hourCost.toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-400">Bs {formatBs(calculateTimeCostBsBreakdown(0, fullBreakdown.hourCost, config, tasaUSD).hourCostBs)}</p>
                                </div>
                            </div>
                            {hoursOffset > 0 && (
                                <div className="flex items-center justify-between px-4 py-2 border-t border-blue-100 dark:border-blue-900/30 bg-blue-100/40 dark:bg-blue-900/20">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Pagado ({formatHoursPaid(hoursOffset)})</p>
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">-${(hoursOffset * (config.pricePerHour || 0)).toFixed(2)}</p>
                                </div>
                            )}
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
                                    const disc = itemDiscounts[item.id];
                                    const hasDisc = disc && disc.value > 0;
                                    const discAmt = hasDisc ? (disc.type === 'percentage' ? lineTotal * (disc.value / 100) : Math.min(disc.value * Number(item.qty), lineTotal)) : 0;
                                    const finalLine = lineTotal - discAmt;
                                    const isOpen = discountPopoverItem === item.id;
                                    return (
                                        <div key={i}>
                                            <div className="flex items-center justify-between px-4 py-3">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <span className="w-7 h-7 bg-amber-200 dark:bg-amber-800/60 rounded-lg flex items-center justify-center text-[11px] font-black text-amber-700 dark:text-amber-300 shrink-0">
                                                        {item.qty}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-700 dark:text-white truncate">
                                                            {item.product_name || item.name}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <p className="text-[10px] text-slate-400">
                                                                ${Number(item.unit_price_usd).toFixed(2)} c/u
                                                            </p>
                                                            {hasDisc && (
                                                                <span className="inline-flex items-center gap-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-500 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                                                                    <Tag size={7} />
                                                                    {disc.type === 'percentage' ? `${disc.value}%` : `$${disc.value}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 pl-3">
                                                    {canDiscount && (
                                                        <button onClick={() => { setDiscountPopoverItem(isOpen ? null : item.id); setDiscountCustomValue(''); }}
                                                            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${isOpen ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25 scale-110' : hasDisc ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-500 hover:bg-rose-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-amber-100 hover:text-amber-500'}`}>
                                                            <Percent size={12} />
                                                        </button>
                                                    )}
                                                    <div className="text-right min-w-[60px]">
                                                        {hasDisc ? (
                                                            <>
                                                                <p className="text-[10px] line-through text-slate-400">${lineTotal.toFixed(2)}</p>
                                                                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">${finalLine.toFixed(2)}</p>
                                                            </>
                                                        ) : (
                                                            <p className="text-sm font-black text-slate-800 dark:text-white">${lineTotal.toFixed(2)}</p>
                                                        )}
                                                        <p className="text-[10px] text-slate-400">Bs {formatBs(finalLine * tasaUSD)}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Per-item discount panel */}
                                            {isOpen && (
                                                <div className="mx-3 mb-3 rounded-2xl overflow-hidden border border-rose-200 dark:border-rose-800/40 bg-gradient-to-b from-rose-50 to-white dark:from-rose-950/30 dark:to-slate-900 shadow-lg shadow-rose-500/5">
                                                    {/* Header */}
                                                    <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded-md bg-rose-500 flex items-center justify-center">
                                                                <Tag size={10} className="text-white" />
                                                            </div>
                                                            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                                                                {item.product_name || item.name}
                                                            </p>
                                                        </div>
                                                        {hasDisc && (
                                                            <button onClick={() => {
                                                                setItemDiscounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                                                                setDiscountPopoverItem(null);
                                                            }}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors active:scale-95">
                                                                <Trash2 size={10} />
                                                                <span className="text-[10px] font-bold">Quitar</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Preset percentage cards */}
                                                    <div className="px-4 pb-2.5">
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {[10, 15, 20, 50].map(pct => {
                                                                const isActive = disc?.type === 'percentage' && disc?.value === pct;
                                                                const saved = lineTotal * (pct / 100);
                                                                return (
                                                                    <button key={pct} onClick={() => {
                                                                        setItemDiscounts(prev => ({ ...prev, [item.id]: { type: 'percentage', value: pct } }));
                                                                        setDiscountPopoverItem(null);
                                                                    }}
                                                                        className={`py-2.5 rounded-xl text-center transition-all active:scale-95 ${isActive
                                                                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                                                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20'}`}>
                                                                        <span className="block text-sm font-black leading-none">{pct}%</span>
                                                                        <span className={`block text-[9px] font-medium mt-1 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                                                                            -${saved.toFixed(2)}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Custom amount */}
                                                    <div className="px-4 pb-3">
                                                        <div className="flex gap-2 items-center">
                                                            <div className="flex-1 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 focus-within:border-rose-400 focus-within:ring-2 focus-within:ring-rose-100 dark:focus-within:ring-rose-900/30 transition-all">
                                                                <span className="text-rose-400 text-sm font-black mr-1">$</span>
                                                                <input type="number" inputMode="decimal" step="any" min="0"
                                                                    value={discountCustomValue}
                                                                    onChange={e => setDiscountCustomValue(e.target.value)}
                                                                    placeholder="Monto fijo por unidad"
                                                                    className="flex-1 bg-transparent text-sm font-bold text-slate-700 dark:text-white py-2.5 outline-none placeholder-slate-300 dark:placeholder-slate-600" />
                                                            </div>
                                                            <button onClick={() => {
                                                                const v = parseFloat(discountCustomValue);
                                                                if (v > 0) {
                                                                    setItemDiscounts(prev => ({ ...prev, [item.id]: { type: 'fixed', value: v } }));
                                                                    setDiscountPopoverItem(null);
                                                                }
                                                            }}
                                                                className="h-[42px] px-5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-black rounded-xl active:scale-95 transition-all shadow-md shadow-rose-500/20">
                                                                OK
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Sin consumos */}
                    {(!currentItems || currentItems.length === 0) && timeCost === 0 && !hasSeats && (
                        <div className="py-8 text-center text-slate-400">
                            <Coffee size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Sin consumos registrados</p>
                        </div>
                    )}

                    </>)}
                    {/* ═══ END CLASSIC MODE ═══ */}

                    {/* Descuento general */}
                    {discountAmountUsd > 0 && (
                        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">Descuento aplicado</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{discount.type === 'percentage' ? `${discount.value}%` : `$${discount.value} fijo`}</p>
                            </div>
                            <p className="text-base font-black text-rose-500">-${discountAmountUsd.toFixed(2)}</p>
                        </div>
                    )}

                    {/* Total */}
                    <div
                        className="rounded-2xl p-4 flex items-center justify-between"
                        style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                    >
                        <div>
                            <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Total a Cobrar</p>
                            {hasSeats && seatBreakdown && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    {seatBreakdown.seats.filter(s => !s.seat.paid).length} persona(s) activa(s)
                                    {discountAmountUsd > 0 ? ` − Desc $${discountAmountUsd.toFixed(2)}` : ''}
                                </p>
                            )}
                            {!hasSeats && isMixed && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    Piñas ${fullBreakdown.pinaCost.toFixed(2)} + Tiempo ${fullBreakdown.hourCost.toFixed(2)}{adjustedConsumption > 0 ? ` + Consumos $${adjustedConsumption.toFixed(2)}` : ''}
                                    {(roundsOffset > 0 || hoursOffset > 0) ? ` − Pagado $${(roundsOffset * (config.pricePina || 0) + hoursOffset * (config.pricePerHour || 0)).toFixed(2)}` : ''}
                                    {discountAmountUsd > 0 ? ` − Desc $${discountAmountUsd.toFixed(2)}` : ''}
                                </p>
                            )}
                            {!hasSeats && !isMixed && (timeCost > 0 || adjustedConsumption > 0 || discountAmountUsd > 0) && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    {timeCost > 0 ? `Tiempo $${timeCost.toFixed(2)}` : ''}
                                    {timeCost > 0 && adjustedConsumption > 0 ? ' + ' : ''}
                                    {adjustedConsumption > 0 ? `Consumos $${adjustedConsumption.toFixed(2)}` : ''}
                                    {discountAmountUsd > 0 ? ` − Desc $${discountAmountUsd.toFixed(2)}` : ''}
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-white">
                                ${hasSeats && seatBreakdown ? (seatBreakdown.grandTotal - discountAmountUsd).toFixed(2) : finalTotal.toFixed(2)}
                            </p>
                            <p className="text-xs font-bold text-white/70">
                                Bs {formatBs((hasSeats && seatBreakdown ? (seatBreakdown.grandTotal - discountAmountUsd) : finalTotal) * tasaUSD)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────── */}
                <div className="shrink-0 px-4 pb-6 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {/* Individual seat payment selector */}
                    {hasSeats && payingSeatId === null && (
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cerrar
                            </button>
                            {canDiscount && (
                                <button
                                    onClick={() => setShowDiscountModal(true)}
                                    className={`py-3.5 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${discountAmountUsd > 0 ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                >
                                    <Percent size={14} />
                                </button>
                            )}
                            <button
                                disabled={customDivisionMismatch}
                                onClick={() => onProceedToPayment(discount, itemDiscounts)}
                                className={`flex-[2] py-3.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/25 ${customDivisionMismatch ? 'opacity-40 cursor-not-allowed' : ''}`}
                                style={{ background: customDivisionMismatch ? '#94a3b8' : 'linear-gradient(135deg, #F97316, #EA580C)' }}
                            >
                                Cobrar Todo
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                    {hasSeats && payingSeatId === null && (
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider py-1.5 mr-1">Cobrar individual:</span>
                            {seats.filter(s => !s.paid).map(seat => {
                                const sb = seatBreakdown?.seats.find(s => s.seat.id === seat.id);
                                return (
                                    <button
                                        key={seat.id}
                                        disabled={customDivisionMismatch}
                                        onClick={() => onProceedToPayment(discount, itemDiscounts, seat.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700/40 hover:bg-sky-100 dark:hover:bg-sky-900/30 active:scale-95 transition-all ${customDivisionMismatch ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                        {seat.label || `P${seats.indexOf(seat) + 1}`} · ${sb ? sb.subtotal.toFixed(2) : '0.00'}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Classic footer (no seats) */}
                    {!hasSeats && (
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cerrar
                            </button>
                            {canDiscount && (
                                <button
                                    onClick={() => setShowDiscountModal(true)}
                                    className={`py-3.5 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${discountAmountUsd > 0 ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                >
                                    <Percent size={14} />
                                    {discountAmountUsd > 0 ? `${discount.type === 'percentage' ? discount.value + '%' : '$' + discount.value}` : 'Desc'}
                                </button>
                            )}
                            <button
                                onClick={() => onProceedToPayment(discount, itemDiscounts)}
                                className="flex-[2] py-3.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/25"
                                style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                            >
                                Cobrar ${finalTotal.toFixed(2)}
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Discount Modal */}
                {showDiscountModal && (
                    <DiscountModal
                        currentDiscount={discount}
                        onApply={(d) => { setDiscount(d); setShowDiscountModal(false); }}
                        onClose={() => setShowDiscountModal(false)}
                        cartSubtotalUsd={subtotalAfterItems}
                        effectiveRate={effectiveRate || tasaUSD}
                        tasaCop={0}
                        copEnabled={false}
                        userRole={currentUser?.role || 'ADMIN'}
                        maxDiscountPercent={100}
                    />
                )}
            </div>
        </div>
    );
}
