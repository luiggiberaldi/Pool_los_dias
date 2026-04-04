import React, { useState, useEffect } from 'react';
import { Layers, CheckCircle2, AlertCircle, RefreshCw, DollarSign, CreditCard } from 'lucide-react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import { useAuthStore } from '../hooks/store/authStore';
import { calculateSessionCost, calculateElapsedTime } from '../utils/tableBillingEngine';
import { Modal } from '../components/Modal';
import { useConfirm } from '../hooks/useConfirm.jsx';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useProductContext } from '../context/ProductContext';
import { showToast } from '../components/Toast';
import { round2 } from '../utils/dinero';
import { openCashDrawerWebSerial, getWebSerialConfig } from '../services/webSerialPrinter';
function useBcvRate() {
    try {
        const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
        return saved?.bcv?.price || 1;
    } catch { return 1; }
}

export default function CashierCheckoutView({ triggerHaptic, isActive }) {
    const { tables, activeSessions, config, closeSession, cancelCheckoutRequest, syncTablesAndSessions } = useTablesStore();
    const { orders: allOrders, orderItems: allItems } = useOrdersStore();
    const { currentUser } = useAuthStore();
    const tasaUSD = useBcvRate();
    const confirm = useConfirm();

    const [selectedSession, setSelectedSession] = useState(null);
    const [selectedTable, setSelectedTable] = useState(null);

    useEffect(() => {
        if (isActive) {
            syncTablesAndSessions();
        }
    }, [isActive, syncTablesAndSessions]);

    // Only show sessions that are waiting for checkout
    const checkoutSessions = activeSessions.filter(s => s.status === 'CHECKOUT');
    
    // Sort so oldest requests appear first
    checkoutSessions.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

    const handleSelectForPayment = (session) => {
        const table = tables.find(t => t.id === session.table_id);
        if (table) {
            triggerHaptic();
            setSelectedSession(session);
            setSelectedTable(table);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-y-auto w-full relative">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[#F8FAFC]/90 dark:bg-[#0f172a]/90 backdrop-blur-xl px-6 pt-4 pb-3 border-b border-slate-200/50 dark:border-white/5">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
                            <DollarSign className="text-emerald-500" />
                            Cola de Cobros
                        </h2>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">
                            {checkoutSessions.length} mesa{checkoutSessions.length !== 1 ? 's' : ''} esperando cobro
                        </p>
                    </div>
                    <button 
                        onClick={() => { triggerHaptic(); syncTablesAndSessions(); }}
                        className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="p-6">
                {checkoutSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <CheckCircle2 size={48} className="text-emerald-400 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Cola vacía</h3>
                        <p className="text-slate-500 mt-2 text-sm max-w-sm">No hay mesas pendientes de cobro en este momento.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {checkoutSessions.map(session => {
                            const table = tables.find(t => t.id === session.table_id);
                            if (!table) return null;

                            const order = allOrders.find(o => o.table_session_id === session.id);
                            const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
                            const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);
                            
                            const elapsed = calculateElapsedTime(session.started_at);
                            const isTimeFree = table.type === 'NORMAL';
                            const timeCost = !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times) : 0;
                            const grandTotal = timeCost + totalConsumption;

                            return (
                                <div key={session.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border-2 border-orange-500/30 flex flex-col gap-3">
                                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                                        <h3 className="font-black tracking-tight text-slate-800 dark:text-white">{table.name}</h3>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-widest flex items-center gap-1">
                                            <AlertCircle size={10} />
                                            En Cobro
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <span className="text-slate-500">Total a cobrar:</span>
                                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">${grandTotal.toFixed(2)}</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        <button 
                                            onClick={async () => {
                                                if (await confirm({
                                                    title: '¿Devolver Cobro?',
                                                    message: '¿Estás seguro que deseas rechazar la solicitud de cobro y devolverla al mesero?',
                                                    confirmText: 'Sí, devolver',
                                                    variant: 'warning'
                                                })) {
                                                    cancelCheckoutRequest(session.id);
                                                }
                                            }}
                                            className="w-full py-2.5 rounded-xl font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-600 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 transition-colors text-xs"
                                        >
                                            Devolver
                                        </button>
                                        <button 
                                            onClick={() => handleSelectForPayment(session)}
                                            className="w-full py-2.5 rounded-xl font-black bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-400 active:scale-95 transition-all text-sm"
                                        >
                                            Cobrar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {selectedSession && selectedTable && (
                <PaymentModal 
                    session={selectedSession} 
                    table={selectedTable} 
                    config={config} 
                    rates={tasaUSD} 
                    currentUser={currentUser}
                    onClose={() => { setSelectedSession(null); setSelectedTable(null); }}
                    onSuccess={() => { setSelectedSession(null); setSelectedTable(null); syncTablesAndSessions(); }}
                />
            )}
        </div>
    );
}

function PaymentModal({ session, table, config, rates, currentUser, onClose, onSuccess }) {
    const { closeSession } = useTablesStore();
    const { orders: allOrders, orderItems: allItems } = useOrdersStore();
    const { products, copEnabled, tasaCop, useAutoRate } = useProductContext();
    
    const [method, setMethod] = useState('EFECTIVO');
    const [receivedUSD, setReceivedUSD] = useState('');
    const [receivedBs, setReceivedBs] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Calculate totals
    const order = allOrders.find(o => o.table_session_id === session.id);
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);
    
    // Elapsed time calculation
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const [elapsed, setElapsed] = useState(0);
    
    useEffect(() => {
        if (isPlaying && session.started_at) {
            setElapsed(calculateElapsedTime(session.started_at));
        }
    }, [isPlaying, session?.started_at]);

    const isTimeFree = table.type === 'NORMAL';
    const timeCost = !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times) : 0;
    const grandTotal = timeCost + totalConsumption;

    // Change calculations
    const rUsd = parseFloat(receivedUSD || '0');
    const rBs = parseFloat(receivedBs || '0');
    const totalReceivedInUSD = rUsd + (rBs / rates);
    
    const changeUSD = totalReceivedInUSD > grandTotal ? totalReceivedInUSD - grandTotal : 0;
    const changeBs = changeUSD * rates;
    const isReady = totalReceivedInUSD >= grandTotal;

    const handleConfirmPayment = async () => {
        if (!isReady) return;
        setIsProcessing(true);
        try {
            // 1. Armar el carrito de compras a partir de currentItems
            const cart = currentItems.map(item => ({
                id: item.product_id,
                _originalId: item.product_id,
                name: item.product_name,
                qty: item.qty,
                priceUsd: Number(item.unit_price_usd),
                isWeight: false
            }));

            // 2. Si la mesa cobró tiempo, ingresarlo como ítem virtual
            if (timeCost > 0) {
                cart.push({
                    id: `MESA-${session.id}`,
                    _originalId: `MESA-${session.id}`,
                    name: `Mesa ${table.name} (${session.game_mode})`,
                    qty: 1,
                    priceUsd: round2(timeCost),
                    isWeight: false
                });
            }

            // 3. Preparar array de pagos
            const paymentPayload = [];
            if (rUsd > 0) {
                paymentPayload.push({
                    methodId: method === 'EFECTIVO' ? 'EFECTIVO' : method,
                    amountUsd: rUsd,
                    currency: 'USD'
                });
            }
            if (rBs > 0) {
                paymentPayload.push({
                    methodId: method,
                    amountUsd: round2(rBs / rates),
                    currency: 'VES'
                });
            }
            // Fallback preventivo si el total es 0 (ej. mesa libre cancelada/cortesía)
            if (rUsd === 0 && rBs === 0 && grandTotal === 0) {
                paymentPayload.push({ methodId: method, amountUsd: 0, currency: 'USD' });
            }

            // 4. Invocar transaccionario
            const saleResult = await processSaleTransaction({
                cart,
                cartTotalUsd: grandTotal,
                cartTotalBs: grandTotal * rates,
                cartSubtotalUsd: grandTotal,
                payments: paymentPayload,
                changeBreakdown: { changeUsdGiven: changeUSD, changeBsGiven: changeBs },
                selectedCustomerId: null,
                customers: [],
                products: products || [],
                effectiveRate: rates,
                tasaCop: tasaCop || 0,
                copEnabled: copEnabled || false,
                discountData: null,
                useAutoRate: useAutoRate || true
            });

            if (!saleResult.success) {
                showToast('Error', saleResult.error || 'Fallo registrando en el motor de ventas', 'error');
                setIsProcessing(false);
                return;
            }

            // 5. Abrir cajón de dinero automáticamente (Si está configurado y soportado por Web Serial API)
            const wsCfg = getWebSerialConfig();
            if (wsCfg.autoOpenDrawer) {
                openCashDrawerWebSerial().catch(err => {
                    console.log('Cajón no se pudo abrir por WebSerial:', err.message);
                }); // Silencioso, no bloquea
            }

            // 6. Cerrar finalmente la sesión en la base de datos de mesas
            await closeSession(session.id, currentUser?.id || "SYSTEM", grandTotal, method);
            showToast('Cobro Exitoso', `La mesa ${table.name} ha sido facturada correctamente.`, 'success');
            onSuccess();
        } catch (error) {
            console.error(error);
            showToast('Error de Cierre', 'No se pudo procesar el pago finalizado.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={`Cobro: ${table.name}`}>
            <div className="flex flex-col gap-4 py-2">
                
                {/* Method Selector */}
                <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {['EFECTIVO', 'PUNTO', 'PAGO MOVIL'].map(m => (
                        <button
                            key={m}
                            onClick={() => setMethod(m)}
                            className={`py-2 text-[10px] font-black rounded-lg transition-all ${
                                method === m 
                                    ? 'bg-white shadow-sm text-sky-600' 
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* Amount to pay */}
                <div className="flex justify-between items-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Total a pagar</span>
                        <span className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70 pt-1">Tasa: Bs. {Number(rates).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 leading-none mb-1">
                            ${grandTotal.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-emerald-600/80 dark:text-emerald-400/80">
                            Bs. {(grandTotal * rates).toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Denomination inputs (for EFECTIVO primarily) */}
                <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 ml-1">Recibido (Divisa)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                                type="number" 
                                value={receivedUSD}
                                onChange={e => setReceivedUSD(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-8 pr-3 font-bold text-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 ml-1">Recibido (Bs)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Bs</span>
                            <input 
                                type="number" 
                                value={receivedBs}
                                onChange={e => setReceivedBs(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-8 pr-3 font-bold text-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                </div>

                {/* Change */}
                {(rUsd > 0 || rBs > 0) && (
                    <div className={`mt-2 p-3 rounded-xl flex items-center justify-between border ${!isReady ? 'bg-rose-50 border-rose-200' : 'bg-sky-50 border-sky-200'}`}>
                        <span className={`text-sm font-bold ${!isReady ? 'text-rose-600' : 'text-sky-700'}`}>
                            {!isReady ? 'Falta cobrar:' : 'Vuelto:'}
                        </span>
                        <div className="flex flex-col items-end">
                            <span className={`text-lg font-black ${!isReady ? 'text-rose-600' : 'text-sky-600'}`}>
                                ${!isReady ? (grandTotal - totalReceivedInUSD).toFixed(2) : changeUSD.toFixed(2)}
                            </span>
                            {isReady && changeUSD > 0 && (
                                <span className="text-[10px] font-bold text-sky-600/70">
                                    Bs. {changeBs.toFixed(2)}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Action */}
                <button
                    onClick={handleConfirmPayment}
                    disabled={!isReady || isProcessing}
                    className={`w-full mt-4 py-4 rounded-xl font-black text-lg transition-all flex items-center justify-center gap-2 ${
                        isReady && !isProcessing
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 active:scale-95' 
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    {isProcessing ? 'Procesando...' : <><CreditCard size={20}/> Confirmar Pago</>}
                </button>
            </div>
        </Modal>
    );
}
