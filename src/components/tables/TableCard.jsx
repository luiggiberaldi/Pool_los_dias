import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Timer, DollarSign, Activity, ShoppingBag, Edit2, Printer, X, AlertTriangle, CreditCard, Clock, Eye } from 'lucide-react';
import { calculateElapsedTime, calculateSessionCost, formatElapsedTime } from '../../utils/tableBillingEngine';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { OrderPanel } from './OrderPanel';

import { generatePartialSessionTicketPDF } from '../../utils/ticketGenerator';
import { logEvent } from '../../services/auditService';
import { Modal } from '../Modal';

// Read live BCV rate from rates cache
function useBcvRate() {
    try {
        const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
        return saved?.bcv?.price || 1;
    } catch { return 1; }
}

export default function TableCard({ table, session }) {
    const { config, openSession, closeSession, requestCheckout, cancelCheckoutRequest } = useTablesStore();
    const tasaUSD = useBcvRate();
    const { currentUser } = useAuthStore();
    const [elapsed, setElapsed] = useState(0);
    const [showOrderPanel, setShowOrderPanel] = useState(false);


    const isAvailable = !session || session.status === 'CLOSED';
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const isCheckoutPending = session?.status === 'CHECKOUT';

    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [showModeModal, setShowModeModal] = useState(false);
    const [showTotalDetails, setShowTotalDetails] = useState(false);
    const [adjustMins, setAdjustMins] = useState('');

    // Always call hooks unconditionally — React rules of hooks
    const allOrders = useOrdersStore(state => state.orders);
    const allItems = useOrdersStore(state => state.orderItems);
    const cancelOrderBySessionId = useOrdersStore(state => state.cancelOrderBySessionId);
    
    const order = session ? allOrders.find(o => o.table_session_id === session.id) : null;
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);
    
    const handleCancelTable = async () => {
        setShowCancelModal(false); // Feeds instant UX feedback
        try {
            await cancelOrderBySessionId(session.id).catch(e => console.warn("cancelOrder offline", e));
            await closeSession(session.id, currentUser?.id || "SYSTEM", 0).catch(e => console.warn("closeSession offline", e));
            
            logEvent('MESAS', 'ANULACION', `Mesa ${table.name} anulada manualmente. ${currentItems.length} items descartados.`, currentUser);
        } catch (error) {
            console.error("Error anlando mesa", error);
            alert("No se pudo conectar a la base de datos para anular. Verifique su internet.");
        }
    };

    // Live Timer Update
    useEffect(() => {
        let interval;
        if (isPlaying && session.started_at) {
            // Initial sync
            setElapsed(calculateElapsedTime(session.started_at));
            
            // Re-calculate every 30 secs instead of 1 sec to save renders
            interval = setInterval(() => {
                setElapsed(calculateElapsedTime(session.started_at));
            }, 30000);
        } else {
            setElapsed(0);
        }

        return () => clearInterval(interval);
    }, [isPlaying, session?.started_at]);

    const handleStartNormal = async (hours = 0) => {
        if (!currentUser) return;
        await openSession(table.id, currentUser.id, 'NORMAL', hours);
        setShowModeModal(false);
    };

    const handleStartPina = async () => {
        if (!currentUser) return;
        await openSession(table.id, currentUser.id, 'PINA');
    };

    const handleStartConsumption = async () => {
        if (!currentUser) return;
        // Mesas tipo NORMAL no cobran tiempo — se detecta por table.type, no por game_mode
        await openSession(table.id, currentUser.id, 'NORMAL');
    };

    const handleAdjustTime = () => {
        setShowAdjustModal(true);
    };

    const submitAdjustTime = async () => {
        const m = parseInt(adjustMins);
        if (!isNaN(m) && m !== 0) {
            const d = new Date(session.started_at);
            d.setMinutes(d.getMinutes() + m); 
            await useTablesStore.getState().updateSessionTime(session.id, d.toISOString());
        }
        setShowAdjustModal(false);
        setAdjustMins('');
    };



    const handlePrintPartial = async () => {
        if (!session) return;
        await generatePartialSessionTicketPDF({
            table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD
        });
    };

    const isTimeFree = table.type === 'NORMAL';
    const timeCost = isPlaying && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times) : 0;
    const grandTotal = timeCost + totalConsumption;
    
    // Countdown logic
    const hasLimit = session?.hours_paid && session.hours_paid > 0;
    const remainingMins = hasLimit ? (session.hours_paid * 60) - elapsed : 0;
    const isExceeded = hasLimit && remainingMins < 0;

    return (
        <>
        <div className={`relative flex flex-col rounded-3xl p-4 sm:p-5 shadow-sm border-2 overflow-hidden transition-all duration-300 ${
            isAvailable
                ? 'bg-white border-slate-200' 
                : table.type === 'NORMAL'
                    ? 'bg-gradient-to-br from-violet-600 to-fuchsia-500 border-transparent shadow-lg text-white scale-[1.02]'
                    : 'bg-gradient-to-br from-indigo-600 to-sky-500 border-transparent shadow-lg text-white scale-[1.02]'
        }`}>
            {/* Header: Title / Flow Actions */}
            <div className="flex flex-wrap items-start justify-between mb-2 gap-2 border-b border-white/5 pb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className={`text-base sm:text-lg font-black tracking-tight leading-tight ${isAvailable ? 'text-slate-800' : 'text-white'}`}>
                        {table.name}
                    </h3>
                    {isPlaying && (
                        <>
                            <button
                                onClick={handlePrintPartial}
                                className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/40 text-white transition-all active:scale-95 shrink-0"
                                title="Imprimir Pre-Cuenta"
                            >
                                <Printer size={12} />
                            </button>
                            {(currentUser?.role === 'ADMIN' || currentUser?.rol === 'ADMIN') && (
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center bg-rose-500/80 hover:bg-rose-500 text-white transition-all active:scale-95 shrink-0 ml-1 shadow-sm"
                                    title="Anular Mesa"
                                >
                                    <X size={14} strokeWidth={2.5} />
                                </button>
                            )}
                        </>
                    )}
                </div>
                <div className={`px-2 py-1 rounded-md text-[9px] font-black tracking-widest uppercase shrink-0 ${
                    isAvailable ? 'bg-emerald-100 text-emerald-700' : hasLimit ? 'bg-amber-400 text-slate-900 border border-amber-300' : 'bg-white/20 text-white backdrop-blur-md'
                }`}>
                    {isAvailable ? 'LIBRE' : session.game_mode === 'PINA' ? 'LA PIÑA' : isTimeFree ? 'BAR' : hasLimit ? `PREPAGO ${Number(session.hours_paid)}h` : 'JUG.'}
                </div>
            </div>

            {/* Timer & Cost display */}
            <div className="flex-1 flex flex-col justify-center items-center py-2 sm:py-4 min-h-[100px]">
                {isAvailable ? (
                    <div className="flex flex-col items-center opacity-40 grayscale">
                        <Activity size={28} className="text-slate-300 sm:w-10 sm:h-10" strokeWidth={1.5} />
                        <span className="text-[10px] sm:text-xs font-bold mt-2 text-slate-400 uppercase tracking-widest">
                            {table.type === 'NORMAL' ? 'Mesa Normal' : 'Mesa de Pool'}
                        </span>
                    </div>
                ) : (
                    <>
                        {isTimeFree ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 mt-2">
                                <div className="text-lg sm:text-xl font-black text-center">
                                    Orden Activa
                                </div>
                                <div className="text-xs font-medium opacity-80">Acumulando Consumo</div>
                                <div className="text-[10px] sm:text-xs font-bold opacity-60 text-slate-200 bg-white/10 px-2 py-0.5 rounded-full mt-0.5">
                                    Tiempo en mesa: {formatElapsedTime(elapsed)}
                                </div>
                            </div>
                        ) : (
                            <>
                                {session.game_mode === 'PINA' ? (
                                    <div className="flex flex-col items-center justify-center gap-1.5 mt-1">
                                        <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center shadow-inner mb-1">
                                            <TargetIcon size={24} />
                                        </div>
                                        <div className="text-xl sm:text-2xl font-black tracking-tighter text-amber-500 uppercase leading-none">
                                            Modo Piña
                                        </div>
                                        <div className="text-[10px] sm:text-xs font-bold opacity-60 text-slate-200 bg-white/10 px-2 py-0.5 rounded-full">
                                            Tiempo en mesa: {formatElapsedTime(elapsed)}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-center gap-2 relative group">
                                            <div className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tighter drop-shadow-md leading-none ${isExceeded ? 'text-rose-400 animate-pulse' : ''}`}>
                                                {hasLimit ? formatElapsedTime(Math.abs(remainingMins)) : formatElapsedTime(elapsed)}
                                            </div>
                                            <button 
                                                onClick={handleAdjustTime} 
                                                className="absolute -right-7 opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-sky-400 bg-white/10 rounded-full transition-all active:scale-95"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        </div>
                                        {hasLimit && (
                                            <div className={`text-[10px] font-black tracking-wider uppercase mt-1 ${isExceeded ? 'text-rose-400' : 'text-amber-300'}`}>
                                                {isExceeded ? 'TIEMPO EXCEDIDO' : 'TIEMPO RESTANTE'}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {/* Total + Eye — visible for ALL occupied sessions */}
                        <div className="flex items-center justify-center gap-1.5 mt-3">
                            <div className="bg-white/10 px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 backdrop-blur-sm shadow-inner overflow-hidden max-w-full">
                                <DollarSign size={14} className="text-emerald-300 shrink-0" />
                                <span className="text-lg sm:text-xl font-bold text-emerald-300 truncate">{grandTotal.toFixed(2)}</span>
                            </div>
                            <button 
                                onClick={() => setShowTotalDetails(true)}
                                className="bg-sky-500/80 hover:bg-sky-500 p-2 rounded-xl text-white transition-all active:scale-95 shrink-0 shadow-sm"
                                title="Ver detalles"
                            >
                                <Eye size={16} />
                            </button>
                        </div>
                        {session.game_mode === 'PINA' && (
                            <div className="text-[10px] sm:text-xs font-bold opacity-70 mt-2 uppercase tracking-wider text-center flex flex-col items-center text-amber-500">
                                <span>Partidas: {1 + (Number(session.extended_times) || 0)}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Action Buttons */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-col gap-2">
                {isAvailable ? (
                    table.type === 'NORMAL' ? (
                        <button 
                            onClick={handleStartConsumption}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm py-2.5 px-3 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Play size={14} fill="currentColor" /> Ocupar
                        </button>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => setShowModeModal(true)}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] sm:text-xs py-2.5 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <Play size={12} fill="currentColor" /> Normal
                            </button>
                            <button 
                                onClick={handleStartPina}
                                className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-[11px] sm:text-xs py-2.5 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <TargetIcon size={12} /> Piña
                            </button>
                        </div>
                    )
                ) : (
                        <div className="flex flex-col gap-1.5">
                        {/* Botón exclusivo Piña: nueva partida */}
                        {session?.game_mode === 'PINA' && !isCheckoutPending && (
                            <div className="flex gap-1.5">
                                <button
                                    onClick={async () => {
                                        await useTablesStore.getState().addRoundToSession(session.id);
                                    }}
                                    className="flex-1 bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-black text-[11px] sm:text-xs py-2.5 px-2 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                                >
                                    <TargetIcon size={13} /> + Nueva Partida
                                </button>
                                {(currentUser?.role === 'ADMIN' || currentUser?.rol === 'ADMIN') && (Number(session?.extended_times) || 0) > 0 && (
                                    <button
                                        onClick={() => useTablesStore.getState().removeRoundFromSession(session.id)}
                                        title="Quitar partida (solo Admin)"
                                        className="shrink-0 w-9 bg-rose-500/80 hover:bg-rose-500 active:scale-95 text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center"
                                    >
                                        <X size={14} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                        )}

                        {isCheckoutPending ? (
                            /* ── Estado: enviado a caja ── */
                            <div className="flex flex-col gap-1.5">
                                <div className="w-full bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-bold">
                                    <Clock size={14} className="animate-pulse" />
                                    Esperando al cajero...
                                </div>
                                {/* Admin puede revertir */}
                                {(currentUser?.role === 'ADMIN' || currentUser?.rol === 'ADMIN') && (
                                    <button
                                        onClick={() => cancelCheckoutRequest(session.id)}
                                        className="w-full text-[10px] font-bold text-slate-400 hover:text-rose-400 transition-colors py-1"
                                    >
                                        Retirar solicitud
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                                <button 
                                    onClick={() => setShowOrderPanel(true)}
                                    className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[11px] sm:text-xs py-2.5 sm:py-2 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <ShoppingBag size={13} fill="currentColor" />
                                    <span>Consumo</span>
                                </button>
                                <button 
                                    onClick={() => requestCheckout(session.id)}
                                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold text-[11px] sm:text-xs py-2.5 sm:py-2 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <CreditCard size={13} />
                                    <span>Cobrar</span>
                                </button>
                            </div>
                        )}
                        </div>
                )}
            </div>

        </div>

        {/* Modal de Anular Mesa (Exclusivo Admin) */}
        <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} title="Anular Mesa">
            <div className="flex flex-col gap-4 py-2">
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-sm">¿Estás completamente seguro?</h4>
                        <p className="text-sm opacity-90 mt-1 leading-relaxed">
                            Esta acción eliminará el tiempo de la mesa y <strong className="font-black">descartará {currentItems.length} producto(s)</strong> de la orden.
                            No se registrará ninguna venta en el sistema (ideal para mesas abiertas por error).
                        </p>
                    </div>
                </div>
                <button 
                    onClick={handleCancelTable}
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                >
                    <X size={18} /> Confirmar Anulación
                </button>
            </div>
        </Modal>

        {/* Modal de Elegir Tiempo Prepago */}
        <Modal isOpen={showModeModal} onClose={() => setShowModeModal(false)} title="Modo de Juego">
            <div className="flex flex-col gap-3 py-2">
                <button 
                    onClick={() => handleStartNormal(0)}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-sky-500 hover:bg-sky-50/50 group transition-all"
                >
                    <div className="font-black text-slate-800 group-hover:text-sky-700">Abierta (Libre)</div>
                    <div className="text-sm text-slate-500">Mesa por tiempo ilimitado, cobro al final.</div>
                </button>
                <div className="grid grid-cols-2 gap-3 mt-2">
                    <button onClick={() => handleStartNormal(1)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">1 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => handleStartNormal(2)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">2 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => handleStartNormal(3)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">3 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => handleStartNormal(4)} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">4 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                </div>
            </div>
        </Modal>

        {/* Modal Modificar Tiempo / Partidas */}
        <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title={session?.game_mode === 'PINA' ? "Añadir Partidas" : "Modificar Tiempo"}>
            <div className="flex flex-col gap-4 py-2">
                {session?.game_mode === 'PINA' ? (
                    <>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">
                            Añade más partidas a esta mesa de Piña sin tener que cerrarla y volverla a abrir.
                        </p>
                        <button 
                            onClick={async () => { await useTablesStore.getState().addRoundToSession(session.id); setShowAdjustModal(false); }} 
                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-black py-4 rounded-xl border border-amber-500/20 shadow-sm flex items-center justify-center gap-2 text-lg"
                        >
                            <TargetIcon size={20} /> + 1 Partida de Piña
                        </button>
                    </>
                ) : hasLimit ? (
                    <>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">
                            Esta mesa tiene un prepago. Puede extender las horas de la mesa:
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 1); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 1 Hora</button>
                            <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 2); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 2 Horas</button>
                            <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 3); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 3 Horas</button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">
                            Ajuste manual para compensar tiempo si faltó la luz.
                            Use números negativos para restar tiempo transcurrido (ej: -15 reducen el tiempo jugado).
                        </p>
                        <input
                            type="number"
                            placeholder="Minutos (ej: -15)"
                            value={adjustMins}
                            onChange={e => setAdjustMins(e.target.value)}
                            className="w-full text-center text-xl font-bold bg-slate-100 dark:bg-slate-800 dark:text-white rounded-xl py-3 border-none ring-2 ring-transparent focus:ring-sky-500/50"
                        />
                        <button
                            onClick={submitAdjustTime}
                            className="w-full bg-slate-900 dark:bg-sky-500 hover:bg-slate-800 dark:hover:bg-sky-400 text-white font-bold py-3.5 rounded-xl shadow-md"
                        >
                            Confirmar Ajuste
                        </button>
                    </>
                )}
            </div>
        </Modal>

        {/* Portals: rendered in document.body to escape card's CSS transform context */}
        {showOrderPanel && createPortal(
            <div className="fixed inset-0 z-[100] overflow-hidden flex">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOrderPanel(false)} />
                <div className="relative ml-auto h-full">
                    <OrderPanel session={session} table={table} onClose={() => setShowOrderPanel(false)} />
                </div>
            </div>,
            document.body
        )}


        {/* Modal de Detalle de Gastos */}
        <Modal isOpen={showTotalDetails} onClose={() => setShowTotalDetails(false)} title={`Detalle de Cuenta`}>
             <div className="flex flex-col gap-3 py-4 text-slate-800 dark:text-white max-h-[70vh] overflow-y-auto">
                {/* Tiempo / Juego — solo para mesas de Pool/Piña */}
                {table?.type !== 'NORMAL' && (
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                            {session?.game_mode === 'PINA' ? 'Partidas (Piña)' : 'Tiempo de Juego'}
                        </span>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black">${timeCost.toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400">Bs. {(timeCost * tasaUSD).toFixed(2)}</span>
                        </div>
                    </div>
                    <span className="text-xs text-slate-500">
                         {session?.game_mode === 'PINA' ? `${1 + (Number(session?.extended_times) || 0)} partida(s)` : `${formatElapsedTime(elapsed)} horas jugadas`}
                    </span>
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

                {/* Equivalente Bs */}
                <div className="flex justify-between items-center mt-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <div className="flex flex-col">
                        <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Total Cuenta</span>
                        <span className="text-xs font-bold text-emerald-600/70 dark:text-emerald-400/70 pt-1">Tasa: Bs. {Number(tasaUSD).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none mb-1">
                            ${grandTotal.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-emerald-600/80 dark:text-emerald-400/80">
                            Bs. {(grandTotal * tasaUSD).toFixed(2)}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => setShowTotalDetails(false)}
                    className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors"
                >
                    Cerrar Detalle
                </button>
            </div>
        </Modal>

        </>
    );
}
// Subcomponent missing from imports easily mocked
function TargetIcon({size}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
    )
}
