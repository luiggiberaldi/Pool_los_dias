import React, { useEffect, useState, useMemo } from 'react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { Clock, AlertTriangle, Coffee, Timer, ArrowRight, CheckCircle2, DollarSign, ShoppingCart, TrendingUp } from 'lucide-react';
import { calculateElapsedTime, calculateSessionCost } from '../../utils/tableBillingEngine';
import { storageService } from '../../utils/storageService';

export default function OperatorDashboardPanel({ onNavigate }) {
    const { tables, activeSessions, config } = useTablesStore();
    const { orders, orderItems } = useOrdersStore();
    const { currentUser } = useAuthStore();
    const [now, setNow] = useState(new Date());
    const [myStats, setMyStats] = useState({ ventas: 0, revenue: 0, items: 0 });

    // Update time every minute
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Load personal sales stats for today
    useEffect(() => {
        if (!currentUser?.id) return;
        const loadStats = async () => {
            const sales = await storageService.getItem('bodega_sales_v1', []);
            const todayStr = new Date().toISOString().slice(0, 10);
            const mySales = sales.filter(s =>
                s.vendedorId === currentUser.id &&
                s.status !== 'ANULADA' &&
                s.tipo !== 'COBRO_DEUDA' &&
                s.timestamp?.slice(0, 10) === todayStr
            );
            setMyStats({
                ventas: mySales.length,
                revenue: mySales.reduce((sum, s) => sum + (s.totalUsd || 0), 0),
                items: mySales.reduce((sum, s) => sum + (s.items ? s.items.reduce((is, i) => is + i.qty, 0) : 0), 0)
            });
        };
        loadStats();
        // Reload when sales change
        const onUpdate = (e) => { if (e.detail?.key === 'bodega_sales_v1') loadStats(); };
        window.addEventListener('app_storage_update', onUpdate);
        return () => window.removeEventListener('app_storage_update', onUpdate);
    }, [currentUser?.id]);

    // 1. Alertas de Tiempo (Mesas por Vencerse - Pool)
    const timeAlerts = useMemo(() => {
        return activeSessions
            .filter(s => s.status === 'ACTIVE' && s.game_mode === 'NORMAL' && s.hours_paid > 0)
            .map(session => {
                const elapsedMin = calculateElapsedTime(session.started_at);
                const paidMin = (session.hours_paid || 0) * 60;
                const remainingMin = paidMin - elapsedMin;
                return { session, remainingMin };
            })
            .filter(data => data.remainingMin <= 15) // Solo mesas con 15min o menos, o negativas (vencidas)
            .sort((a, b) => a.remainingMin - b.remainingMin);
    }, [activeSessions, now]); // eslint-disable-line react-hooks/exhaustive-deps

    // 2. Alertas de Inactividad (+45min sin pedidos nuevos en ordenes activas, excluyendo la hora de inicio de mesa de billar vacía)
    // Para simplificar, revisaremos la fecha "created_at" o "started_at" de la mesa vs la fecha del ultimo item.
    const inactivityAlerts = useMemo(() => {
        const alerts = [];
        activeSessions.forEach(session => {
            if (session.status !== 'ACTIVE') return;
            const order = orders.find(o => o.table_session_id === session.id);
            const items = orderItems.filter(i => i.order_id === order?.id);
            
            // Determinar la última interacción (creación de sesión o agregado de un ítem)
            let lastInteractionStr = session.started_at; 
            if (items.length > 0) {
                // Buscamos el ítem insertado más recientemente
                const latestItemStr = items.reduce((latest, item) => {
                    return (!latest || new Date(item.created_at || now) > new Date(latest)) ? item.created_at : latest;
                }, null);
                if (latestItemStr) lastInteractionStr = latestItemStr;
            }

            const diffMin = Math.floor((now - new Date(lastInteractionStr)) / 60000);
            
            // Si pasaron más de 45 minutos sin interacciones...
            if (diffMin >= 45) {
                alerts.push({ session, idleMinutes: diffMin });
            }
        });
        return alerts.sort((a, b) => b.idleMinutes - a.idleMinutes); // Mayor inactividad primero
    }, [activeSessions, orders, orderItems, now]);

    // 3. Monitoreo de Seguridad (Cuentas > $30 USD)
    const HIGH_BILL_THRESHOLD = 30;
    const highBillAlerts = useMemo(() => {
        return activeSessions.map(session => {
            if (session.status !== 'ACTIVE') return null;
            // Game Cost
            const elapsedMin = calculateElapsedTime(session.started_at);
            const gameCost = calculateSessionCost(elapsedMin, session.game_mode, config, session.hours_paid, session.extended_times);
            
            // Consumption Cost
            let consumptionCost = 0;
            const order = orders.find(o => o.table_session_id === session.id);
            if (order) {
                const items = orderItems.filter(i => i.order_id === order.id);
                consumptionCost = items.reduce((sum, item) => sum + ((item.unit_price_usd || 0) * item.qty), 0);
            }

            const totalUsd = gameCost + consumptionCost;
            if (totalUsd >= HIGH_BILL_THRESHOLD) {
                return { session, totalUsd };
            }
            return null;
        }).filter(Boolean).sort((a, b) => b.totalUsd - a.totalUsd);
    }, [activeSessions, orders, orderItems, now, config]); // eslint-disable-line react-hooks/exhaustive-deps

    const getTableName = (tableId) => {
        return tables.find(t => t.id === tableId)?.name || 'Mesa ?';
    };

    const hasAnyAlert = timeAlerts.length > 0 || inactivityAlerts.length > 0 || highBillAlerts.length > 0;

    return (
        <div className="space-y-4 pt-1">
            {/* HEROLINE / SUMARIO */}
            <div className="bg-slate-800 rounded-[1.5rem] p-5 shadow-lg relative overflow-hidden" 
                 style={{ background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)' }}>
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
                <h2 className="text-white text-lg font-black tracking-tight mb-4">Resumen de Turno</h2>
                
                <div className="grid grid-cols-3 gap-4 relative z-10">
                    <div>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest pl-1 mb-1">Mesas Activas</p>
                        <p className="text-3xl font-black text-white leading-none pl-1">
                            {activeSessions.filter(s => s.status === 'ACTIVE').length}
                        </p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest pl-1 mb-1">Mis Ventas Hoy</p>
                        <p className="text-3xl font-black text-emerald-400 leading-none pl-1">
                            {myStats.ventas}
                        </p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest pl-1 mb-1">Aportado</p>
                        <p className="text-2xl font-black text-amber-400 leading-none pl-1">
                            ${myStats.revenue.toFixed(2)}
                        </p>
                    </div>
                </div>
            </div>

            {/* ALERTAS */}
            {!hasAnyAlert && (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 flex flex-col items-center justify-center text-center shadow-sm">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 size={32} />
                    </div>
                    <p className="font-black text-slate-800 text-lg mb-1">Todo bajo control</p>
                    <p className="text-xs text-slate-500 font-medium px-4">No hay alertas urgentes pendientes. ¡Excelente servicio!</p>
                </div>
            )}

            {/* TIME ALERTS */}
            {timeAlerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5 mt-4">
                        <Timer size={12} /> Tiempos Críticos
                    </h3>
                    {timeAlerts.map(({ session, remainingMin }) => {
                        const isExpired = remainingMin <= 0;
                        const tableName = getTableName(session.table_id);
                        return (
                            <div key={session.id} 
                                onClick={() => { if(onNavigate) onNavigate('mesas'); }}
                                className={`rounded-xl p-3 border shadow-sm relative overflow-hidden active:scale-95 transition-all cursor-pointer flex items-center justify-between
                                    ${isExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}
                                `}>
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                                        ${isExpired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}
                                    `}>
                                        <AlertTriangle size={18} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 leading-none mb-1">{tableName}</p>
                                        <p className={`text-xs font-bold ${isExpired ? 'text-red-500' : 'text-amber-600'}`}>
                                            {isExpired ? `Tiempo vencido por ${Math.abs(remainingMin)} min` : `Quedan ${remainingMin} min`}
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight size={16} className={isExpired ? 'text-red-300' : 'text-amber-300'} />
                            </div>
                        )
                    })}
                </div>
            )}

            {/* HIGH BILL ALERTS */}
            {highBillAlerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5 mt-4">
                        <AlertTriangle size={12} /> Cuentas Altas (&gt;&nbsp;${HIGH_BILL_THRESHOLD})
                    </h3>
                    {highBillAlerts.map(({ session, totalUsd }) => {
                        const tableName = getTableName(session.table_id);
                        return (
                            <div key={session.id} 
                                onClick={() => { if(onNavigate) onNavigate('mesas'); }}
                                className="rounded-xl p-3 border border-pink-200 shadow-sm relative overflow-hidden bg-pink-50 active:scale-95 transition-all cursor-pointer flex items-center justify-between">
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-lg flex items-center justify-center">
                                        <span className="font-black">$</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 leading-none mb-1">{tableName}</p>
                                        <p className="text-xs font-bold text-pink-600">
                                            Cuenta alcanza los ${totalUsd.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight size={16} className="text-pink-300" />
                            </div>
                        )
                    })}
                </div>
            )}

            {/* INACTIVITY ALERTS */}
            {inactivityAlerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5 mt-4">
                        <Coffee size={12} /> Mesas Inactivas (+45min)
                    </h3>
                    {inactivityAlerts.map(({ session, idleMinutes }) => {
                        const tableName = getTableName(session.table_id);
                        return (
                            <div key={session.id} 
                                onClick={() => { if(onNavigate) onNavigate('mesas'); }}
                                className="rounded-xl p-3 border border-slate-200 shadow-sm relative overflow-hidden bg-white active:scale-95 transition-all cursor-pointer flex items-center justify-between">
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                                        <Clock size={18} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 leading-none mb-1">{tableName}</p>
                                        <p className="text-xs font-bold text-slate-500">
                                            {Math.floor(idleMinutes / 60) > 0 ? `${Math.floor(idleMinutes / 60)}h ${idleMinutes % 60}m` : `${idleMinutes} min`} sin atención
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight size={16} className="text-slate-300" />
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
