import React, { useState, useEffect, useRef } from 'react';
import { Layers, CheckCircle2, AlertCircle, RefreshCw, DollarSign, CreditCard, Search, UserCheck, X, User, Users } from 'lucide-react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import { useAuthStore } from '../hooks/store/authStore';
import { useCustomersStore } from '../hooks/store/useCustomersStore';
import { calculateSessionCost, calculateElapsedTime, calculateGrandTotalBs } from '../utils/tableBillingEngine';
import { Modal } from '../components/Modal';
import { useConfirm } from '../hooks/useConfirm.jsx';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useProductContext } from '../context/ProductContext';
import { showToast } from '../components/Toast';
import { round2, subR, sumR, divR, mulR } from '../utils/dinero';
import { openCashDrawerWebSerial, getWebSerialConfig } from '../services/webSerialPrinter';
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

export default function CashierCheckoutView({ triggerHaptic, isActive }) {
    const { tables, activeSessions, config, closeSession, cancelCheckoutRequest, syncTablesAndSessions, paidHoursOffsets, paidRoundsOffsets } = useTablesStore();
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
                            const totalConsumption = round2(currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0));

                            const elapsed = calculateElapsedTime(session.started_at);
                            const isTimeFree = table.type === 'NORMAL';
                            const hoursOffset = (paidHoursOffsets || {})[session.id] || 0;
                            const roundsOffset = (paidRoundsOffsets || {})[session.id] || 0;
                            const timeCost = !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset) : 0;
                            const grandTotal = round2(timeCost + totalConsumption);

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
    const { closeSession, resetSessionAfterPayment, paidHoursOffsets, paidRoundsOffsets } = useTablesStore();
    const { cancelOrderBySessionId } = useOrdersStore();
    const { orders: allOrders, orderItems: allItems } = useOrdersStore();
    const cachedUsers = useAuthStore(s => s.cachedUsers);
    const { products, copEnabled, tasaCop, useAutoRate } = useProductContext();

    const [method, setMethod] = useState('EFECTIVO');
    const [receivedUSD, setReceivedUSD] = useState('');
    const [receivedBs, setReceivedBs] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [splitPeople, setSplitPeople] = useState(null);
    const [postPaymentAction, setPostPaymentAction] = useState(null); // { sessionId, tableName, grandTotal, method }

    // Customer selection state
    const { customers: allCustomers, fetchCustomers } = useCustomersStore();
    useEffect(() => { fetchCustomers(); }, []);

    const [customerSearch, setCustomerSearch] = useState('');

    // Debug temporal — ver qué contiene la sesión
    console.log('[PaymentModal] session.client_id:', session.client_id, 'session.client_name:', session.client_name);

    const [selectedCustomer, setSelectedCustomer] = useState(() => {
        if (!session.client_id && !session.client_name) return null;
        // Intentar encontrar en store local primero (datos completos)
        if (session.client_id) {
            const cached = useCustomersStore.getState().customers;
            const found = cached.find(c => c.id === session.client_id);
            if (found) return found;
        }
        // Fallback: crear objeto mínimo con los datos del session (siempre disponibles)
        if (session.client_name) {
            return { id: session.client_id || null, name: session.client_name, deuda: 0 };
        }
        return null;
    });
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const customerSearchRef = useRef(null);
    const dropdownRef = useRef(null);

    // Cuando el store local carga, reemplazar el objeto mínimo con el completo (para tener deuda, etc.)
    useEffect(() => {
        if (session.client_id && allCustomers.length > 0) {
            const found = allCustomers.find(c => c.id === session.client_id);
            if (found) setSelectedCustomer(found);
        }
    }, [allCustomers, session.client_id]);

    const isFiado = method === 'FIADO';

    // Filter customers by search
    const filteredCustomers = customerSearch.trim().length > 0
        ? allCustomers.filter(c =>
            (c.name || c.nombre || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
            (c.phone || c.telefono || '').includes(customerSearch)
          ).slice(0, 6)
        : [];

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                customerSearchRef.current && !customerSearchRef.current.contains(e.target)) {
                setShowCustomerDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Calculate totals
    const order = allOrders.find(o => o.table_session_id === session.id);
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumption = round2(currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0));

    // Elapsed time calculation
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (isPlaying && session.started_at) {
            setElapsed(calculateElapsedTime(session.started_at));
        }
    }, [isPlaying, session?.started_at]);

    const isTimeFree = table.type === 'NORMAL';
    const hoursOffset = (paidHoursOffsets || {})[session?.id] || 0;
    const roundsOffset = (paidRoundsOffsets || {})[session?.id] || 0;
    const timeCost = !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset) : 0;
    const grandTotal = round2(timeCost + totalConsumption);

    // Change calculations
    const rUsd = parseFloat(receivedUSD || '0');
    const rBs = parseFloat(receivedBs || '0');
    const totalReceivedInUSD = round2(rUsd + divR(rBs, rates));

    const changeUSD = totalReceivedInUSD > grandTotal ? round2(subR(totalReceivedInUSD, grandTotal)) : 0;
    const changeBs = round2(mulR(changeUSD, rates));
    const isReady = isFiado ? !!selectedCustomer : totalReceivedInUSD >= grandTotal;

    const handleSelectCustomer = (customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch('');
        setShowCustomerDropdown(false);
    };

    const handleConfirmPayment = async () => {
        if (!isReady || isProcessing) return;
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
            if (isFiado) {
                paymentPayload.push({ methodId: 'FIADO', amountUsd: grandTotal, currency: 'USD' });
            } else {
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
                        amountUsd: round2(divR(rBs, rates)),
                        currency: 'VES'
                    });
                }
                // Fallback preventivo si el total es 0
                if (rUsd === 0 && rBs === 0 && grandTotal === 0) {
                    paymentPayload.push({ methodId: method, amountUsd: 0, currency: 'USD' });
                }
            }

            // 4. Invocar transaccionario — atribuir venta al mesero que abrió la mesa
            let meseroUser = null;
            if (session.opened_by) {
                let openerUser = cachedUsers?.find(u => u.id === session.opened_by) || null;
                if (!openerUser) {
                    try {
                        const { supabaseCloud } = await import('../config/supabaseCloud');
                        const { data } = await supabaseCloud.from('staff_users').select('id, name, role').eq('id', session.opened_by).single();
                        if (data) openerUser = data;
                    } catch (_) {}
                }
                if (openerUser?.role === 'MESERO' || openerUser?.rol === 'MESERO') {
                    meseroUser = openerUser;
                }
            }
            const saleResult = await processSaleTransaction({
                cart,
                cartTotalUsd: grandTotal,
                cartTotalBs: calculateGrandTotalBs(timeCost, totalConsumption, session.game_mode, config, rates),
                cartSubtotalUsd: grandTotal,
                payments: paymentPayload,
                changeBreakdown: { changeUsdGiven: changeUSD, changeBsGiven: changeBs },
                selectedCustomerId: selectedCustomer?.id || null,
                customers: allCustomers,
                products: products || [],
                effectiveRate: rates,
                tasaCop: tasaCop || 0,
                copEnabled: copEnabled || false,
                discountData: null,
                useAutoRate: useAutoRate || true,
                meseroId: meseroUser?.id || null,
                meseroNombre: meseroUser?.name || meseroUser?.nombre || null,
                tableName: table?.name || null
            });

            if (!saleResult.success) {
                showToast('Error', saleResult.error || 'Fallo registrando en el motor de ventas', 'error');
                setIsProcessing(false);
                return;
            }

            // 5. Abrir cajón de dinero automáticamente (solo si NO es fiado)
            if (!isFiado) {
                const wsCfg = getWebSerialConfig();
                if (wsCfg.autoOpenDrawer) {
                    openCashDrawerWebSerial().catch(err => {
                        console.log('Cajón no se pudo abrir por WebSerial:', err.message);
                    });
                }
            }

            // 6. Mostrar diálogo post-pago para decidir qué hacer con la mesa
            setPostPaymentAction({
                sessionId: session.id,
                tableName: table.name,
                grandTotal,
                method: isFiado ? 'FIADO' : method,
                customerName: selectedCustomer?.name || selectedCustomer?.nombre || null,
                isFiado
            });
            showToast(
                'Cobro Exitoso',
                isFiado
                    ? `Mesa ${table.name} cargada a cuenta de ${selectedCustomer?.name || selectedCustomer?.nombre}.`
                    : `La mesa ${table.name} ha sido facturada correctamente.`,
                'success'
            );
        } catch (error) {
            console.error(error);
            showToast('Error de Cierre', 'No se pudo procesar el pago finalizado.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <>
        <Modal isOpen={!postPaymentAction} onClose={onClose} title={`Cobro: ${table.name}`}>
            <div className="flex flex-col gap-4 py-2">

                {/* Customer Selector */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <User size={12} /> Cliente (opcional)
                    </label>
                    {selectedCustomer ? (
                        <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/40 rounded-xl">
                            <div className="flex items-center gap-2">
                                <UserCheck size={16} className="text-sky-600" />
                                <div>
                                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300 leading-none">
                                        {selectedCustomer.name || selectedCustomer.nombre}
                                    </p>
                                    {selectedCustomer.phone || selectedCustomer.telefono ? (
                                        <p className="text-[10px] text-sky-600 dark:text-sky-400 mt-0.5">
                                            {selectedCustomer.phone || selectedCustomer.telefono}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedCustomer(null); if (isFiado) setMethod('EFECTIVO'); }}
                                className="p-1 rounded-full text-sky-500 hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="relative flex items-center">
                                <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                                <input
                                    ref={customerSearchRef}
                                    type="text"
                                    value={customerSearch}
                                    onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                                    onFocus={() => setShowCustomerDropdown(true)}
                                    placeholder="Buscar cliente por nombre o teléfono..."
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-sky-400 focus:outline-none"
                                />
                            </div>
                            {showCustomerDropdown && filteredCustomers.length > 0 && (
                                <div
                                    ref={dropdownRef}
                                    className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
                                >
                                    {filteredCustomers.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => handleSelectCustomer(c)}
                                            className="w-full text-left px-4 py-3 hover:bg-sky-50 dark:hover:bg-sky-900/20 border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors"
                                        >
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{c.name || c.nombre}</p>
                                            {(c.phone || c.telefono) && (
                                                <p className="text-[10px] text-slate-500">{c.phone || c.telefono}</p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Method Selector */}
                <div className={`grid gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl ${selectedCustomer ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {['EFECTIVO', 'PUNTO', 'PAGO MOVIL', ...(selectedCustomer ? ['FIADO'] : [])].map(m => (
                        <button
                            key={m}
                            onClick={() => setMethod(m)}
                            className={`py-2 text-[10px] font-black rounded-lg transition-all ${
                                method === m
                                    ? m === 'FIADO'
                                        ? 'bg-white shadow-sm text-rose-600'
                                        : 'bg-white shadow-sm text-sky-600'
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
                            Bs. {calculateGrandTotalBs(timeCost, totalConsumption, session.game_mode, config, rates).toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Split Bill */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Users size={12} /> Dividir Cuenta
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        {[2, 3, 4, 5, 6, 7, 8].map(n => (
                            <button
                                key={n}
                                onClick={() => setSplitPeople(splitPeople === n ? null : n)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border ${
                                    splitPeople === n
                                        ? 'bg-violet-500 text-white border-violet-500 shadow-md shadow-violet-500/30'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                                }`}
                            >
                                {n} personas
                            </button>
                        ))}
                    </div>
                    {splitPeople && grandTotal > 0 && (
                        <div className="mt-1 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-xl flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-widest">
                                    Por persona ({splitPeople})
                                </p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-xl font-black text-violet-700 dark:text-violet-300 leading-none">
                                    ${divR(grandTotal, splitPeople).toFixed(2)}
                                </span>
                                <span className="text-xs font-bold text-violet-600/70 dark:text-violet-400/70 mt-0.5">
                                    Bs. {divR(calculateGrandTotalBs(timeCost, totalConsumption, session.game_mode, config, rates), splitPeople).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Fiado notice OR denomination inputs */}
                {isFiado ? (
                    <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700/40 rounded-xl text-center">
                        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                            Se cargará ${grandTotal.toFixed(2)} a la cuenta de
                        </p>
                        <p className="text-base font-black text-rose-800 dark:text-rose-200 mt-1">
                            {selectedCustomer?.name || selectedCustomer?.nombre}
                        </p>
                        <p className="text-[10px] text-rose-600/70 mt-1">No se abrirá la caja registradora</p>
                    </div>
                ) : (
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
                )}

                {/* Change */}
                {!isFiado && (rUsd > 0 || rBs > 0) && (
                    <div className={`mt-2 p-3 rounded-xl flex items-center justify-between border ${!isReady ? 'bg-rose-50 border-rose-200' : 'bg-sky-50 border-sky-200'}`}>
                        <span className={`text-sm font-bold ${!isReady ? 'text-rose-600' : 'text-sky-700'}`}>
                            {!isReady ? 'Falta cobrar:' : 'Vuelto:'}
                        </span>
                        <div className="flex flex-col items-end">
                            <span className={`text-lg font-black ${!isReady ? 'text-rose-600' : 'text-sky-600'}`}>
                                ${!isReady ? subR(grandTotal, totalReceivedInUSD).toFixed(2) : changeUSD.toFixed(2)}
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
                            ? isFiado
                                ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/30 active:scale-95'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 active:scale-95'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    {isProcessing ? 'Procesando...' : isFiado ? <><CreditCard size={20}/> Cargar a Cuenta</> : <><CreditCard size={20}/> Confirmar Pago</>}
                </button>
            </div>
        </Modal>

        {/* Post-payment dialog: ¿Liberar mesa o dejar activa? */}
        {postPaymentAction && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full">
                    <div className="text-center mb-5">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                            <span className="text-2xl">✓</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white">Cobro Exitoso</h3>
                        <p className="text-sm text-slate-500 mt-1">¿Qué deseas hacer con <strong>{postPaymentAction.tableName}</strong>?</p>
                    </div>
                    <div className="flex flex-col gap-2.5">
                        <button
                            onClick={async () => {
                                try {
                                    await closeSession(postPaymentAction.sessionId, currentUser?.id || "SYSTEM", postPaymentAction.grandTotal, postPaymentAction.method);
                                } catch { showToast("Error al liberar mesa", "warning"); }
                                setPostPaymentAction(null);
                                onSuccess();
                            }}
                            className="w-full py-3.5 rounded-xl font-black text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                        >
                            Liberar Mesa
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    await resetSessionAfterPayment(postPaymentAction.sessionId);
                                    await cancelOrderBySessionId(postPaymentAction.sessionId);
                                } catch { showToast("Error al resetear mesa", "warning"); }
                                setPostPaymentAction(null);
                                onSuccess();
                            }}
                            className="w-full py-3.5 rounded-xl font-black text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border-2 border-violet-200 dark:border-violet-700/50 hover:bg-violet-100 dark:hover:bg-violet-900/50 active:scale-95 transition-all"
                        >
                            Dejar Activa
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
