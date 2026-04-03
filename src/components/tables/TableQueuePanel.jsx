import React, { useEffect } from 'react';
import { CreditCard, Clock, X, ChevronRight, Coffee, Timer } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { formatElapsedTime, calculateElapsedTime, calculateSessionCost } from '../../utils/tableBillingEngine';

function useBcvRate() {
    try {
        const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
        return saved?.bcv?.price || 1;
    } catch { return 1; }
}

/**
 * Panel shown in SalesView (cashier) listing all tables that have requested checkout.
 * Cashier taps a row to open the TableCheckoutModal for that table.
 */
export function TableQueuePanel({ onCheckoutTable }) {
    const { tables, activeSessions, subscribeToRealtime, unsubscribeFromRealtime } = useTablesStore();
    const { orders, orderItems } = useOrdersStore();
    const config = useTablesStore(s => s.config);
    const tasaUSD = useBcvRate();

    // Ensure realtime is active while this panel is mounted
    useEffect(() => {
        subscribeToRealtime();
        return () => {}; // don't unsubscribe — shared channel
    }, [subscribeToRealtime]);

    const pendingSessions = activeSessions.filter(s => s.status === 'CHECKOUT');

    if (pendingSessions.length === 0) return null;

    return (
        <div className="mb-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 rounded-2xl sm:rounded-3xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-orange-200 dark:border-orange-800/40">
                <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/40 rounded-xl flex items-center justify-center">
                    <CreditCard size={16} className="text-orange-500" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-black text-orange-700 dark:text-orange-400">Cuentas Pendientes de Cobro</p>
                    <p className="text-[11px] text-orange-500/70">{pendingSessions.length} mesa{pendingSessions.length !== 1 ? 's' : ''} esperando</p>
                </div>
                <div className="w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-black animate-pulse">
                    {pendingSessions.length}
                </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-orange-100 dark:divide-orange-800/20">
                {pendingSessions.map(session => {
                    const table = tables.find(t => t.id === session.table_id);
                    if (!table) return null;

                    const order = orders.find(o => o.table_session_id === session.id);
                    const items = order ? orderItems.filter(i => i.order_id === order.id) : [];
                    const totalConsumption = items.reduce((a, i) => a + Number(i.unit_price_usd) * Number(i.qty), 0);
                    const elapsed = session.started_at ? calculateElapsedTime(session.started_at) : 0;
                    const timeCost = calculateSessionCost(elapsed, session.game_mode, config, session.hours_paid, session.extended_times);
                    const grandTotal = timeCost + totalConsumption;

                    return (
                        <button
                            key={session.id}
                            onClick={() => onCheckoutTable({ table, session, elapsed, timeCost, totalConsumption, currentItems: items, grandTotal })}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-100/60 dark:hover:bg-orange-900/20 transition-colors text-left"
                        >
                            {/* Table name badge */}
                            <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-md shadow-orange-500/20">
                                {table.name.replace(/[^0-9]/g, '') || table.name.charAt(0)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{table.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                        <Timer size={10} /> {formatElapsedTime(elapsed)}
                                    </span>
                                    {items.length > 0 && (
                                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <Coffee size={10} /> {items.length} consumo{items.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Total */}
                            <div className="text-right shrink-0">
                                <p className="font-black text-slate-800 dark:text-white text-sm">${grandTotal.toFixed(2)}</p>
                                <p className="text-[10px] text-slate-400">Bs {(grandTotal * tasaUSD).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</p>
                            </div>

                            <ChevronRight size={16} className="text-orange-400 shrink-0" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
