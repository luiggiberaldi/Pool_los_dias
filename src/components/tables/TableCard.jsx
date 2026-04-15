import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Timer, DollarSign, Activity, ShoppingBag, Edit2, Printer, X, AlertTriangle, CreditCard, Clock, Eye, Users, Search, UserCheck, UserPlus, Check, Phone, Pause, Lock, MessageSquare, ChevronLeft } from 'lucide-react';
import { calculateElapsedTime, calculateSessionCost, calculateSessionCostBreakdown, formatElapsedTime, calculateTimeCostBs, calculateTimeCostBsBreakdown, calculateGrandTotalBs } from '../../utils/tableBillingEngine';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useNotifications } from '../../hooks/useNotifications';
import { useCustomersStore } from '../../hooks/store/useCustomersStore';
import { OrderPanel } from './OrderPanel';
import { SeatEditor } from './SeatEditor';

import { generatePartialSessionTicketPDF } from '../../utils/ticketGenerator';
import { showToast } from '../Toast';
import { logEvent } from '../../services/auditService';
import { Modal } from '../Modal';
import { useConfirm } from '../../hooks/useConfirm';

// ─── CustomerSheet: Bottom sheet responsivo para seleccionar/crear cliente ────
function CustomerSheet({ customers, selectedId, onSelect, onClose, onCreateCustomer }) {
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newDoc, setNewDoc] = useState('');
    const [saving, setSaving] = useState(false);
    const searchRef = useRef(null);
    const nameRef = useRef(null);

    useEffect(() => {
        if (showCreate) setTimeout(() => nameRef.current?.focus(), 80);
        else setTimeout(() => searchRef.current?.focus(), 80);
    }, [showCreate]);

    const q = search.toLowerCase().trim();
    const filtered = q
        ? customers.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
            (c.documentId && c.documentId.toLowerCase().includes(q))
          )
        : [...customers].sort((a, b) => {
            if (a.id === selectedId) return -1;
            if (b.id === selectedId) return 1;
            return (a.name || '').localeCompare(b.name || '', 'es');
          });

    const handleCreate = async () => {
        if (!newName.trim() || saving) return;
        setSaving(true);
        try {
            const created = await onCreateCustomer(newName.trim(), newPhone.trim(), newDoc.trim());
            onSelect(created.id);
            onClose();
        } catch { showToast('Error al crear cliente', 'error'); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />
            <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[75vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

                {/* Handle (móvil) */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white">
                            {showCreate ? 'Nuevo Cliente' : 'Seleccionar Cliente'}
                        </h3>
                        {!showCreate && <p className="text-xs text-slate-400 mt-0.5">{customers.length} clientes registrados</p>}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {showCreate ? (
                    /* ── Formulario crear cliente ── */
                    <div className="flex flex-col flex-1 overflow-y-auto">
                        <div className="px-5 py-4 space-y-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Nombre <span className="text-red-400">*</span>
                                </label>
                                <input
                                    ref={nameRef}
                                    type="text"
                                    placeholder="Ej: Juan Pérez"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Cédula / RIF <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: V-12345678"
                                    value={newDoc}
                                    onChange={e => setNewDoc(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-all uppercase"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Teléfono <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                                </label>
                                <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-sky-500/40 focus-within:border-sky-400 transition-all">
                                    <span className="px-3 py-3 text-xs font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 select-none shrink-0">+58</span>
                                    <input
                                        type="tel"
                                        placeholder="0412 123 4567"
                                        value={newPhone}
                                        onChange={e => setNewPhone(e.target.value.replace(/^\+?58/, ''))}
                                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                        className="flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 dark:text-white outline-none placeholder:text-slate-400 font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-5 pb-6 flex gap-2.5 shrink-0">
                            <button
                                onClick={() => { setShowCreate(false); setNewName(''); setNewDoc(''); setNewPhone(''); }}
                                className="flex-1 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 active:scale-95 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || saving}
                                className="flex-1 py-3 text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-xl disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
                            >
                                {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                                {saving ? 'Guardando...' : 'Crear y Usar'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Lista de clientes ── */
                    <>
                        {/* Buscador */}
                        <div className="px-4 py-3 shrink-0">
                            <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                <Search size={15} className="text-slate-400 shrink-0" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Buscar por nombre, cédula o teléfono..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 font-medium"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="w-5 h-5 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center">
                                        <X size={10} className="text-slate-600 dark:text-slate-200" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 pb-safe">
                            {/* Sin cliente */}
                            {!q && (
                                <button
                                    onClick={() => { onSelect(null); onClose(); }}
                                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors ${!selectedId ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                                >
                                    <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                        <Users size={18} className="text-slate-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <span className={`text-sm font-bold ${!selectedId ? 'text-sky-700 dark:text-sky-400' : 'text-slate-700 dark:text-slate-300'}`}>Sin cliente asignado</span>
                                        <p className="text-xs text-slate-400 mt-0.5">Mesa sin nombre de cliente</p>
                                    </div>
                                    {!selectedId && <Check size={16} className="text-sky-500 shrink-0" />}
                                </button>
                            )}

                            {/* Nuevo cliente */}
                            <button
                                onClick={() => setShowCreate(true)}
                                className="w-full flex items-center gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                            >
                                <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                                    <UserPlus size={18} className="text-sky-600 dark:text-sky-400" />
                                </div>
                                <div className="flex-1 text-left">
                                    <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                                        {q ? `Crear "${search}"` : 'Nuevo cliente...'}
                                    </span>
                                    <p className="text-xs text-slate-400 mt-0.5">Agregar a la base de clientes</p>
                                </div>
                            </button>

                            {/* Separador */}
                            {filtered.length > 0 && (
                                <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        {q ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` : 'Clientes'}
                                    </span>
                                </div>
                            )}

                            {/* Lista */}
                            {filtered.map(c => {
                                const isSelected = selectedId === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => { onSelect(c.id); onClose(); }}
                                        className={`w-full flex items-center gap-3 px-5 py-3 transition-colors border-t border-slate-50 dark:border-slate-800/60 ${isSelected ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                                    >
                                        <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0 text-base font-black text-sky-600 dark:text-sky-400">
                                            {(c.name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1 text-left">
                                            <p className={`text-sm font-semibold truncate ${isSelected ? 'text-sky-700 dark:text-sky-300 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {c.name}
                                            </p>
                                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                {c.documentId && (
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                        <CreditCard size={10} className="shrink-0" />{c.documentId}
                                                    </span>
                                                )}
                                                {c.phone && (
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                        <Phone size={10} className="shrink-0" />{c.phone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isSelected && <Check size={15} className="text-sky-500 shrink-0" />}
                                    </button>
                                );
                            })}

                            {q && filtered.length === 0 && (
                                <div className="px-5 py-10 text-center border-t border-slate-100 dark:border-slate-800">
                                    <p className="text-sm font-semibold text-slate-500">Sin resultados para "{search}"</p>
                                    <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-bold text-sky-600 dark:text-sky-400 underline">
                                        Crear "{search}" como nuevo cliente
                                    </button>
                                </div>
                            )}
                            <div className="h-4" />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}


function useStaffName(staffId) {
    const cachedUsers = useAuthStore(s => s.cachedUsers);
    if (!staffId || !cachedUsers?.length) return null;
    const user = cachedUsers.find(u => u.id === staffId);
    return user?.name || user?.nombre || null;
}

// Read effective rate: manual if set, otherwise BCV
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

export default function TableCard({ table, session }) {
    const { config, openSession, closeSession, requestCheckout, cancelCheckoutRequest, updateSessionMetadata, updateSessionSeats, updateSessionTime, addPinaToSession, addHoursToSession, pauseSession, resumeSession } = useTablesStore();
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const pausedData = useTablesStore(state => session ? state.pausedSessions[session.id] : null);
    const tasaUSD = useBcvRate();
    const { currentUser } = useAuthStore();
    const staffName = useStaffName(session?.opened_by);
    const confirm = useConfirm();
    const { notifyMesaCobrar, notifyTiempoExcedido, notifyMesaPagadaOciosa } = useNotifications();

    const isAvailable = !session || session.status === 'CLOSED';
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const isCheckoutPending = session?.status === 'CHECKOUT';

    // Bloqueo de mesa: si un mesero abrió la mesa, otros meseros no pueden interactuar
    const isLockedForMe = currentUser?.role === 'MESERO' && isPlaying && session?.opened_by && session.opened_by !== currentUser?.id;

    const [elapsed, setElapsed] = useState(() =>
        isPlaying && session?.started_at ? calculateElapsedTime(session.started_at) : 0
    );
    const [showOrderPanel, setShowOrderPanel] = useState(false);

    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [showModeModal, setShowModeModal] = useState(false);
    const [showTotalDetails, setShowTotalDetails] = useState(false);
    const [showPinaConfirm, setShowPinaConfirm] = useState(false);
    const [adjustMins, setAdjustMins] = useState('');

    // Modo mixto: toggles para modal unificado de apertura
    const [modePina, setModePina] = useState(false);
    const [modeHora, setModeHora] = useState(false);
    const [selectedHours, setSelectedHours] = useState(0);
    // Modal para agregar hora a sesión activa (piña → mixto)
    const [showAddHoursModal, setShowAddHoursModal] = useState(false);

    // Modal de nombre + personas al abrir mesa — wizard steps
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(null);
    const [wizardStep, setWizardStep] = useState(1); // 1=clients, 2=mode, 3=attribution, 4=confirm
    const [initialChargeTarget, setInitialChargeTarget] = useState(null); // seatId or null (shared)
    const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
    const [sessionClientName, setSessionClientName] = useState('');
    const [sessionGuestCount, setSessionGuestCount] = useState('');
    const [sessionClientId, setSessionClientId] = useState(null);
    const [sessionSeats, setSessionSeats] = useState([]);
    const [showCustomerSheet, setShowCustomerSheet] = useState(false);
    const [searchingSeatIndex, setSearchingSeatIndex] = useState(null); // qué seat está buscando cliente
    const { customers: allCustomers, fetchCustomers, createCustomer, refresh: refreshCustomers } = useCustomersStore();

    // Validación de nombres al abrir mesa
    const [seatValidationError, setSeatValidationError] = useState(false);

    // Modal de atribución de tiempo (+Hora / +Piña) a cliente específico o compartido
    const [showAttributeModal, setShowAttributeModal] = useState(false);
    const [pendingCharge, setPendingCharge] = useState(null); // { type: 'hora'|'pina', hoursValue? }
    const [isProcessingCharge, setIsProcessingCharge] = useState(false);

    // Modal de edición de nombre + personas en sesión activa
    const [showEditMetaModal, setShowEditMetaModal] = useState(false);
    const [editClientName, setEditClientName] = useState('');
    const [editGuestCount, setEditGuestCount] = useState('');
    const [editClientId, setEditClientId] = useState(null);
    const [editNotes, setEditNotes] = useState('');
    const [editSeats, setEditSeats] = useState([]);
    const [showEditCustomerSheet, setShowEditCustomerSheet] = useState(false);
    const [searchingEditSeatIndex, setSearchingEditSeatIndex] = useState(null);


    // Fetch customers from Supabase once on mount
    useEffect(() => { fetchCustomers(); }, []);

    // Always call hooks unconditionally — React rules of hooks
    const allOrders = useOrdersStore(state => state.orders);
    const allItems = useOrdersStore(state => state.orderItems);
    const cancelOrderBySessionId = useOrdersStore(state => state.cancelOrderBySessionId);
    
    const order = session ? allOrders.find(o => o.table_session_id === session.id) : null;
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);
    
    const handleCancelTable = async () => {
        setShowCancelModal(false);
        try {
            await Promise.all([
                cancelOrderBySessionId(session.id).catch(e => console.warn("cancelOrder offline", e)),
                closeSession(session.id, currentUser?.id || "SYSTEM", 0).catch(e => console.warn("closeSession offline", e))
            ]);
            logEvent('MESAS', 'ANULACION', `Mesa ${table.name} anulada manualmente. ${currentItems.length} items descartados.`, currentUser);
        } catch (error) {
            console.error("Error anulando mesa", error);
            alert("Ocurrió un error local al preparar la anulación.");
        }
    };

    // Live Timer Update
    const isPaused = pausedData?.isPaused ?? false;
    const pauseElapsed = pausedData?.elapsedAtPause ?? 0;

    useEffect(() => {
        let interval;
        if (isPlaying && session?.started_at && !isPaused) {
            // Use rAF for initial sync to avoid synchronous setState in effect
            const raf = requestAnimationFrame(() => {
                setElapsed(calculateElapsedTime(session.started_at));
            });

            // Re-calculate every second so the timer feels live for customers watching
            interval = setInterval(() => {
                setElapsed(calculateElapsedTime(session.started_at));
            }, 1000);

            return () => {
                cancelAnimationFrame(raf);
                clearInterval(interval);
            };
        } else if (isPaused) {
            setElapsed(pauseElapsed);
        } else {
            const raf = requestAnimationFrame(() => {
                setElapsed(0);
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [isPlaying, session?.started_at, isPaused, pauseElapsed]);

    const handlePauseTimer = () => {
        if (!session) return;
        const currentElapsed = calculateElapsedTime(session.started_at);
        setElapsed(currentElapsed);
        pauseSession(session.id, currentElapsed);
    };

    const handleResumeTimer = async () => {
        if (!session) return;
        await resumeSession(session.id);
    };

    const handleStartNormal = async (hours = 0, clientName = '', guestCount = 0, clientId = null, includePina = false, seats = []) => {
        if (!currentUser) return;
        const parts = [];
        if (includePina) parts.push('Piña');
        if (hours === 0) parts.push('Libre');
        else if (hours === 0.5) parts.push('Prepago 30 min');
        else parts.push(`Prepago ${hours} hr${hours !== 1 ? 's' : ''}`);
        const modeLabel = parts.join(' + ');
        const ok = await confirm({ title: `Abrir ${table.name}`, message: `¿Confirmar apertura en modo ${modeLabel}?`, confirmText: 'Abrir Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'NORMAL', hours, clientName, guestCount, clientId, includePina, seats);
        setShowModeModal(false);
    };

    const handleStartPina = async (clientName = '', guestCount = 0, clientId = null, seats = []) => {
        if (!currentUser) return;
        const ok = await confirm({ title: `Abrir ${table.name}`, message: '¿Confirmar apertura en modo La Piña?', confirmText: 'Abrir Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'PINA', 0, clientName, guestCount, clientId, false, seats);
    };

    const handleStartConsumption = async (clientName = '', guestCount = 0, clientId = null, seats = []) => {
        if (!currentUser) return;
        const ok = await confirm({ title: `Ocupar ${table.name}`, message: '¿Confirmar apertura de mesa?', confirmText: 'Ocupar Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'NORMAL', 0, clientName, guestCount, clientId, false, seats);
    };

    // Abre el modal de nombre/personas y guarda la acción pendiente
    const handleRequestOpen = (mode, hours = 0) => {
        setSessionClientName('');
        setSessionGuestCount('');
        setSessionClientId(null);
        setSessionSeats([]);
        setModePina(false);
        setModeHora(false);
        setSelectedHours(0);
        setInitialChargeTarget(null);
        setWizardStep(1);
        refreshCustomers();
        setPendingOpen({ mode, hours });
        setShowOpenModal(true);
    };

    const handleCreateCustomer = async (name, phone, documentId) => {
        const newCustomer = await createCustomer(name, phone, documentId);
        return newCustomer;
    };

    // Selección de cliente en la búsqueda para un seat del modal de apertura
    const handleSelectCustomerForSeat = (customer) => {
        if (searchingSeatIndex !== null) {
            const updated = sessionSeats.map((s, i) =>
                i === searchingSeatIndex
                    ? { ...s, customerId: customer.id, label: s.label || customer.name }
                    : s
            );
            setSessionSeats(updated);
            setSearchingSeatIndex(null);
        } else {
            setSessionClientId(customer.id);
            setSessionClientName(customer.name);
        }
        setShowCustomerSheet(false);
    };

    // Helper: if only 1 active seat, charge directly to them; if 2+, show attribution modal
    const requestAttribution = (charge) => {
        const seats = session?.seats || [];
        const activeSeats = seats.filter(s => !s.paid);
        if (activeSeats.length === 1) {
            // Single client — charge directly, no modal needed
            setPendingCharge(charge);
            // Use setTimeout to let pendingCharge state settle before calling handler
            setTimeout(() => handleAttributeCharge(activeSeats[0].id, charge), 0);
        } else if (activeSeats.length > 1) {
            setPendingCharge(charge);
            setShowAttributeModal(true);
        }
    };

    // Atribuir +Hora a cliente específico o compartido
    const handleAttributeCharge = async (seatId, chargeOverride) => {
        const charge = chargeOverride || pendingCharge;
        if (!charge || isProcessingCharge) return;
        setIsProcessingCharge(true);
        try {
            if (charge.type === 'hora') {
                await addHoursToSession(session.id, charge.hoursValue, seatId || null);
                showToast(`${charge.hoursValue === 0.5 ? '30 min' : charge.hoursValue + 'h'} agregadas`, 'success');
            } else if (charge.type === 'pina') {
                const { addRoundToSession } = useTablesStore.getState();
                await addRoundToSession(session.id, seatId || null);
            }
        } catch (e) {
            console.error('Error al atribuir cargo:', e);
            showToast('Error al agregar cargo', 'error');
        } finally {
            setShowAttributeModal(false);
            setPendingCharge(null);
            setIsProcessingCharge(false);
        }
    };

    // Wizard final step: open the session and apply initial charge attribution
    const handleWizardFinish = async () => {
        if (!pendingOpen) return;
        const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
        const firstSeatClientId = firstSeat?.customerId || sessionClientId;
        const name = firstSeat
            ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
            : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
        const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
        const seats = sessionSeats.length > 0 ? sessionSeats : [];
        const isMultiSeat = seats.length > 1;
        const { mode } = pendingOpen;

        // For pool tables (SHOW_MODE) use the selected mode
        if (mode === 'SHOW_MODE') {
            if (!modePina && !modeHora) return;
            if (modePina && !modeHora) {
                await openSession(table.id, currentUser.id, 'PINA', 0, name, guests, firstSeatClientId, false, seats);
                // Apply initial piña attribution
                if (isMultiSeat && initialChargeTarget !== undefined) {
                    // Wait briefly for session to be created
                    setTimeout(async () => {
                        try {
                            const { addRoundToSession } = useTablesStore.getState();
                            const newSession = useTablesStore.getState().activeSessions.find(s => s.table_id === table.id);
                            if (newSession) await addRoundToSession(newSession.id, initialChargeTarget);
                        } catch (e) { console.error(e); }
                    }, 500);
                }
            } else if (!modePina && modeHora) {
                if (isMultiSeat && initialChargeTarget !== undefined) {
                    // Open with 0 hours, then attribute
                    await openSession(table.id, currentUser.id, 'NORMAL', 0, name, guests, firstSeatClientId, false, seats);
                    setTimeout(async () => {
                        try {
                            const newSession = useTablesStore.getState().activeSessions.find(s => s.table_id === table.id);
                            if (newSession) await addHoursToSession(newSession.id, selectedHours, initialChargeTarget);
                        } catch (e) { console.error(e); }
                    }, 500);
                } else {
                    await openSession(table.id, currentUser.id, 'NORMAL', selectedHours, name, guests, firstSeatClientId, false, seats);
                }
            } else {
                // Mixed mode
                await openSession(table.id, currentUser.id, 'NORMAL', selectedHours, name, guests, firstSeatClientId, true, seats);
            }
        } else if (mode === 'PINA') {
            await openSession(table.id, currentUser.id, 'PINA', 0, name, guests, firstSeatClientId, false, seats);
            if (isMultiSeat && initialChargeTarget !== undefined) {
                setTimeout(async () => {
                    try {
                        const { addRoundToSession } = useTablesStore.getState();
                        const newSession = useTablesStore.getState().activeSessions.find(s => s.table_id === table.id);
                        if (newSession) await addRoundToSession(newSession.id, initialChargeTarget);
                    } catch (e) { console.error(e); }
                }, 500);
            }
        } else if (mode === 'CONSUMPTION') {
            await openSession(table.id, currentUser.id, 'NORMAL', 0, name, guests, firstSeatClientId, false, seats);
        } else {
            await openSession(table.id, currentUser.id, 'NORMAL', pendingOpen.hours, name, guests, firstSeatClientId, false, seats);
        }

        setShowOpenModal(false);
        setPendingOpen(null);
        setWizardStep(1);
    };

    const handleConfirmOpen = async () => {
        if (!pendingOpen) return;
        setShowOpenModal(false);
        // Tomar nombre del primer seat si hay clientes, si no del campo de cliente clásico
        const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
        const firstSeatCustomerId = firstSeat?.customerId || null;
        const firstSeatClientId = firstSeatCustomerId || sessionClientId;
        const name = firstSeat
            ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
            : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
        const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
        const seats = sessionSeats.length > 0 ? sessionSeats : [];
        const { mode, hours } = pendingOpen;
        if (mode === 'PINA') {
            await handleStartPina(name, guests, firstSeatClientId, seats);
            if (seats.length > 1) {
                requestAttribution({ type: 'pina' });
            }
        }
        else if (mode === 'CONSUMPTION') await handleStartConsumption(name, guests, firstSeatClientId, seats);
        else if (mode === 'SHOW_MODE') {
            // Para mesas de pool: mostrar modal unificado de modo
            setShowModeModal(true);
        }
        else await handleStartNormal(hours, name, guests, firstSeatClientId, false, seats);
        if (mode !== 'SHOW_MODE') setPendingOpen(null);
    };

    // Confirmar apertura desde el modal unificado de modo
    const handleConfirmMode = async () => {
        if (!modePina && !modeHora) return;
        setShowModeModal(false);
        // Derivar nombre del primer asiento si hay multi-cliente (igual que handleConfirmOpen)
        const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
        const firstSeatClientId = firstSeat?.customerId || sessionClientId;
        const name = firstSeat
            ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
            : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
        const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
        const seats = sessionSeats.length > 0 ? sessionSeats : [];

        const isMultiSeat = seats.length > 1;
        const hasSeatClients = seats.length > 0;

        if (modePina && !modeHora) {
            // Session opens with extended_times=-1 (neutralized for multi-seat),
            // then attribute first piña to a client
            await handleStartPina(name, guests, firstSeatClientId, seats);
            if (hasSeatClients) {
                if (isMultiSeat) {
                    setPendingCharge({ type: 'pina' });
                    setShowAttributeModal(true);
                } else {
                    // Single client — attribute directly (no modal)
                    // Need to wait for session to be created, then charge to single seat
                    // For single seat PINA, extended_times stays 0 (no -1 compensation needed)
                }
            }
        } else if (!modePina && modeHora) {
            if (isMultiSeat) {
                // Multi-seat HORA: open with 0 hours, then attribute via modal
                await handleStartNormal(0, name, guests, firstSeatClientId, false, seats);
                setPendingCharge({ type: 'hora', hoursValue: selectedHours });
                setShowAttributeModal(true);
            } else {
                await handleStartNormal(selectedHours, name, guests, firstSeatClientId, false, seats);
            }
        } else {
            // Mixed mode (piña + hora): keep shared for simplicity
            await handleStartNormal(selectedHours, name, guests, firstSeatClientId, true, seats);
        }
        setPendingOpen(null);
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
        try {
            await generatePartialSessionTicketPDF({
                table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config,
                hoursOffset, roundsOffset
            });
            showToast('Pre-cuenta enviada a la impresora', 'success');
        } catch (err) {
            showToast(err.message || 'Error al imprimir pre-cuenta', 'error');
        }
    };

    const isTimeFree = table.type === 'NORMAL';
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;
    const timeCost = isPlaying && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset) : 0;
    // Mesa pagada sin cerrar y sin cargos nuevos agregados
    const isPaidIdle = isPlaying && !!session?.paid_at && timeCost === 0;
    const costBreakdown = isPlaying && !isTimeFree ? calculateSessionCostBreakdown(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset) : null;
    const isMixedMode = costBreakdown ? (costBreakdown.hasPinas && costBreakdown.hasHours) : false;
    const seatHasPinas = (session?.seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const seatHasHours = (session?.seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));
    const hasPinas = (costBreakdown ? costBreakdown.hasPinas : (session?.game_mode === 'PINA')) || seatHasPinas;
    const hasHoursActive = (costBreakdown ? costBreakdown.hasHours : (session?.hours_paid > 0)) || seatHasHours;
    const grandTotal = timeCost + totalConsumption;
    
    // Countdown logic
    const hasLimit = session?.hours_paid && session.hours_paid > 0;
    const remainingMins = hasLimit ? (session.hours_paid * 60) - elapsed : 0;
    const isExceeded = hasLimit && remainingMins < 0;

    // Notification when prepaid time is exceeded (fires once per session)
    const exceededNotifiedRef = useRef(false);
    useEffect(() => {
        if (isExceeded && !exceededNotifiedRef.current) {
            exceededNotifiedRef.current = true;
            notifyTiempoExcedido(table.name);
            showToast(`⏰ ${table.name} — Tiempo agotado. Agregar más tiempo o cobrar.`, 'warning', 8000);
        }
        if (!isExceeded) {
            exceededNotifiedRef.current = false;
        }
    }, [isExceeded, table.name, notifyTiempoExcedido]);

    // Alerta: mesa pagada sin actividad por 15+ minutos
    const paidIdleNotifiedRef = useRef(false);
    useEffect(() => {
        if (isPaidIdle && session?.paid_at) {
            const paidTime = new Date(session.paid_at);
            const msSincePaid = Date.now() - paidTime.getTime();
            const minsSincePaid = msSincePaid / 60000;
            if (minsSincePaid >= 15 && !paidIdleNotifiedRef.current) {
                paidIdleNotifiedRef.current = true;
                notifyMesaPagadaOciosa(table.name);
                showToast(`${table.name} lleva 15+ min pagada sin actividad`, 'warning', 8000);
            }
        }
        if (!isPaidIdle) {
            paidIdleNotifiedRef.current = false;
        }
    }, [isPaidIdle, elapsed, session?.paid_at, table.name, notifyMesaPagadaOciosa]);

    return (
        <>
        <div className={`relative flex flex-col rounded-3xl p-4 sm:p-5 shadow-sm border-2 overflow-hidden transition-all duration-300 ${
            isAvailable
                ? 'bg-white border-slate-200'
                : isLockedForMe
                    ? table.type === 'NORMAL'
                        ? 'bg-gradient-to-br from-violet-600/70 to-fuchsia-500/70 border-white/20 shadow-lg text-white opacity-75'
                        : 'bg-gradient-to-br from-indigo-600/70 to-sky-500/70 border-white/20 shadow-lg text-white opacity-75'
                    : table.type === 'NORMAL'
                        ? 'bg-gradient-to-br from-violet-600 to-fuchsia-500 border-transparent shadow-lg text-white scale-[1.02]'
                        : 'bg-gradient-to-br from-indigo-600 to-sky-500 border-transparent shadow-lg text-white scale-[1.02]'
        }`}>
            {/* Header: Title / Flow Actions */}
            <div className="flex flex-wrap items-start justify-between mb-2 gap-2 border-b border-white/5 pb-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h3 className={`text-base sm:text-lg font-black tracking-tight leading-tight whitespace-nowrap shrink-0 ${isAvailable ? 'text-slate-800' : 'text-white'}`}>
                            {table.name}
                        </h3>
                        {isPlaying && !isLockedForMe && (
                            <>
                                <button
                                    onClick={handlePrintPartial}
                                    className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/40 text-white transition-all active:scale-95 shrink-0"
                                    title="Imprimir Pre-Cuenta"
                                >
                                    <Printer size={12} />
                                </button>
                                {(currentUser?.role === 'ADMIN') && (
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center bg-rose-500/80 hover:bg-rose-500 text-white transition-all active:scale-95 shrink-0 shadow-sm"
                                        title="Anular Mesa"
                                    >
                                        <X size={14} strokeWidth={2.5} />
                                    </button>
                                )}
                            </>
                        )}
                        {isLockedForMe && (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 text-white/60 shrink-0" title="Mesa asignada a otro mesero">
                                <Lock size={12} />
                            </div>
                        )}
                    </div>
                    {isPlaying && staffName && (
                        <span className="text-[10px] font-bold opacity-70 bg-white/15 px-1.5 py-0.5 rounded-md self-start whitespace-nowrap">
                            {staffName}
                        </span>
                    )}
                    {isPlaying && (session?.client_name || session?.guest_count > 0) && (
                        isLockedForMe ? (
                            <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md self-start ${session.client_id ? 'bg-sky-400/30 opacity-100' : 'opacity-80 bg-white/15'}`}>
                                {session.client_id ? <UserCheck size={9} className="shrink-0" /> : null}
                                {session.client_name && <span className="whitespace-nowrap">{session.client_name}</span>}
                                {session.guest_count > 0 && <span className="flex items-center gap-0.5"><Users size={9} />{session.guest_count}</span>}
                            </div>
                        ) : (
                        <button
                            onClick={() => { setEditClientName(session.client_name || ''); setEditGuestCount(session.guest_count > 0 ? String(session.guest_count) : ''); setEditClientId(session.client_id || null); setEditNotes(session.notes || ''); setEditSeats(session.seats || []); setShowEditMetaModal(true); }}
                            className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md self-start transition-colors ${session.client_id ? 'bg-sky-400/30 hover:bg-sky-400/50 opacity-100' : 'opacity-80 bg-white/15 hover:bg-white/30'}`}
                            title="Editar nombre y personas"
                        >
                            {session.client_id ? <UserCheck size={9} className="shrink-0" /> : null}
                            {session.client_name && <span className="whitespace-nowrap">{session.client_name}</span>}
                            {session.guest_count > 0 && <span className="flex items-center gap-0.5"><Users size={9} />{session.guest_count}</span>}
                            <Edit2 size={8} className="opacity-60" />
                        </button>
                        )
                    )}
                    {isPlaying && !session?.client_name && !(session?.guest_count > 0) && !isLockedForMe && (
                        <button
                            onClick={() => { setEditClientName(''); setEditGuestCount(''); setEditClientId(null); setEditNotes(session?.notes || ''); setEditSeats(session?.seats || []); setShowEditMetaModal(true); }}
                            className="text-[10px] font-bold opacity-50 hover:opacity-80 bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded-md self-start transition-colors flex items-center gap-1"
                            title="Añadir nombre y personas"
                        >
                            <Edit2 size={8} /> Añadir info
                        </button>
                    )}
                    {isPlaying && session?.notes && (
                        <div className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md self-start bg-amber-400/20 text-amber-100 max-w-full">
                            <MessageSquare size={9} className="shrink-0" />
                            <span className="truncate">{session.notes}</span>
                        </div>
                    )}
                </div>
                <div className={`px-2 py-1 rounded-md text-[9px] font-black tracking-widest uppercase shrink-0 ${
                    isAvailable ? 'bg-emerald-100 text-emerald-700' : isPaidIdle ? 'bg-emerald-400 text-white' : hasLimit ? 'bg-amber-400 text-slate-900 border border-amber-300' : 'bg-white/20 text-white backdrop-blur-md'
                }`}>
                    {isAvailable ? 'LIBRE' : isPaidIdle ? 'PAGADO' : isMixedMode ? 'PIÑA + HORA' : session.game_mode === 'PINA' ? 'LA PIÑA' : isTimeFree ? 'BAR' : hasLimit ? (session.hours_paid === 0.5 ? 'PREPAGO 30MIN' : `PREPAGO ${Number(session.hours_paid)}h`) : hasPinas ? 'LA PIÑA' : costBreakdown?.isLibre ? 'ABIERTA' : 'JUG.'}
                </div>
            </div>

            {/* Timer & Cost display */}
            <div className="flex-1 flex flex-col justify-center items-center py-1 sm:py-3 min-h-[90px]">
                {isAvailable ? (
                    <div className="flex flex-col items-center gap-2">
                        <Activity
                            size={28}
                            className={`sm:w-9 sm:h-9 opacity-25 ${table.type === 'NORMAL' ? 'text-slate-400' : 'text-sky-400'}`}
                            strokeWidth={1.5}
                        />
                        <span className={`text-xs sm:text-sm font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                            table.type === 'NORMAL'
                                ? 'text-slate-500 bg-slate-100 border-slate-200'
                                : 'text-sky-600 bg-sky-50 border-sky-200'
                        }`}>
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
                        ) : isPaidIdle ? (
                            <div className="flex flex-col items-center gap-2 mt-2">
                                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                    <Check size={20} className="text-emerald-400" />
                                </div>
                                <div className="text-sm font-black text-emerald-400 uppercase tracking-wider">Pagado · $0</div>
                                <div className="text-[10px] font-bold text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                                    {formatElapsedTime(elapsed)} en mesa
                                </div>
                            </div>
                        ) : (
                            <>
                                {isMixedMode ? (
                                    /* ── Display mixto: piñas + timer ── */
                                    <div className="flex flex-col items-center gap-1.5 mt-1 w-full">
                                        {/* Timer */}
                                        <div className="flex items-center justify-center gap-2">
                                            <div className={`text-2xl sm:text-3xl font-black tabular-nums tracking-tighter drop-shadow-md leading-none ${isExceeded ? 'text-rose-400 animate-pulse' : ''}`}>
                                                {hasLimit ? formatElapsedTime(Math.max(0, remainingMins)) : formatElapsedTime(elapsed)}
                                            </div>
                                            {hasLimit && !isLockedForMe && (
                                                <button onClick={handleAdjustTime} className="p-1 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all active:scale-95">
                                                    <span className="text-base font-black leading-none">+</span>
                                                </button>
                                            )}
                                            {!isLockedForMe && (
                                                <button
                                                    onClick={isPaused ? handleResumeTimer : handlePauseTimer}
                                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${isPaused ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                                                >
                                                    {isPaused ? <Play size={10} fill="currentColor" /> : <Pause size={10} />}
                                                </button>
                                            )}
                                        </div>
                                        {hasLimit && (
                                            <div className={`text-[9px] font-black tracking-wider uppercase ${isExceeded ? 'text-rose-400' : 'text-amber-300'}`}>
                                                {isExceeded ? 'TIEMPO EXCEDIDO' : 'TIEMPO RESTANTE'}
                                            </div>
                                        )}
                                        {/* Piñas (compacto) */}
                                        {(() => {
                                            const sharedRounds = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                                            const seatRounds = (session?.seats || []).reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
                                            const totalRounds = sharedRounds + seatRounds;
                                            const paidRounds = roundsOffset || 0;
                                            return (
                                                <div className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-center flex items-center gap-1.5">
                                                    <TargetIcon size={10} />
                                                    {totalRounds} piña{totalRounds !== 1 ? 's' : ''}
                                                    {paidRounds > 0 && <span className="text-emerald-400">({paidRounds} pagada{paidRounds !== 1 ? 's' : ''})</span>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : session.game_mode === 'PINA' || (hasPinas && !hasHoursActive) ? (
                                    <div className="flex flex-col items-center gap-1 mt-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center shrink-0">
                                                <TargetIcon size={16} />
                                            </div>
                                            <div className="text-lg font-black tracking-tight text-amber-400 uppercase leading-none">
                                                Modo Piña
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
                                            {formatElapsedTime(elapsed)} en mesa
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-center gap-2">
                                            <div className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tighter drop-shadow-md leading-none ${isExceeded ? 'text-rose-400 animate-pulse' : ''}`}>
                                                {hasLimit ? formatElapsedTime(Math.max(0, remainingMins)) : formatElapsedTime(elapsed)}
                                            </div>
                                            {/* Botón "+" solo visible en PREPAGO y PIÑA — en modo libre no tiene sentido */}
                                            {(hasLimit || session?.game_mode === 'PINA') && !isLockedForMe && (
                                            <button
                                                onClick={handleAdjustTime}
                                                className="p-1.5 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all active:scale-95"
                                                title="Ampliar tiempo"
                                            >
                                                <span className="text-lg font-black leading-none">+</span>
                                            </button>
                                            )}
                                            {/* Pausa — disponible en prepago y hora libre, NO en piña */}
                                            {session?.game_mode !== 'PINA' && !isLockedForMe && (
                                            <button
                                                onClick={isPaused ? handleResumeTimer : handlePauseTimer}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${isPaused ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                                                title={isPaused ? 'Reanudar tiempo' : 'Pausar tiempo'}
                                            >
                                                {isPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} />}
                                            </button>
                                            )}
                                        </div>
                                        {hasLimit && (
                                            <div className={`text-[10px] font-black tracking-wider uppercase mt-1 ${isExceeded ? 'text-rose-400' : 'text-amber-300'}`}>
                                                {isExceeded ? 'TIEMPO EXCEDIDO' : 'TIEMPO RESTANTE'}
                                            </div>
                                        )}
                                        {hasLimit && hoursOffset > 0 && (
                                            <div className="text-[9px] font-bold text-emerald-300 mt-0.5">
                                                {hoursOffset === 0.5 ? '30min' : `${hoursOffset}h`} pagada{hoursOffset !== 1 ? 's' : ''} de {session.hours_paid === 0.5 ? '30min' : `${Number(session.hours_paid)}h`}
                                            </div>
                                        )}
                                        {costBreakdown?.isLibre && (
                                            <div className="text-[10px] font-black tracking-wider uppercase mt-1 text-emerald-300">
                                                ${timeCost.toFixed(2)} acumulado
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {/* Total + Eye — visible for ALL occupied sessions */}
                        <div className="flex items-center justify-center gap-1.5 mt-3">
                            <div className="bg-white/10 px-3 py-1.5 rounded-xl flex flex-col items-center justify-center backdrop-blur-sm shadow-inner overflow-hidden max-w-full">
                                <div className="flex items-center gap-1.5">
                                    <DollarSign size={14} className="text-emerald-300 shrink-0" />
                                    <span className="text-lg sm:text-xl font-bold text-emerald-300 truncate">{grandTotal.toFixed(2)}</span>
                                </div>
                                {tasaUSD > 0 && (
                                    <span className="text-[10px] font-semibold text-emerald-200/70 leading-tight">
                                        Bs. {calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD, costBreakdown).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </div>
                            <button 
                                onClick={() => setShowTotalDetails(true)}
                                className="bg-sky-500/80 hover:bg-sky-500 p-2 rounded-xl text-white transition-all active:scale-95 shrink-0 shadow-sm"
                                title="Ver detalles"
                            >
                                <Eye size={16} />
                            </button>
                        </div>
                        {hasPinas && !isMixedMode && (() => {
                            const sharedRounds = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                            const seatRounds = (session?.seats || []).reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
                            const totalRounds = sharedRounds + seatRounds;
                            const paidRounds = roundsOffset || 0;
                            return (
                            <div className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full mt-1 text-center">
                                {totalRounds} piña{totalRounds !== 1 ? 's' : ''}
                                {paidRounds > 0 && <span className="text-emerald-400 ml-1">({paidRounds} pagada{paidRounds !== 1 ? 's' : ''})</span>}
                            </div>
                            );
                        })()}
                    </>
                )}
            </div>

            {/* Action Buttons */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-col gap-2">
                {isAvailable ? (
                    table.type === 'NORMAL' ? (
                        <button
                            onClick={() => handleRequestOpen('CONSUMPTION')}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm py-2.5 px-3 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Play size={14} fill="currentColor" /> Ocupar
                        </button>
                    ) : (
                        <button
                            data-tour="mesa-btn-abrir"
                            onClick={() => handleRequestOpen('SHOW_MODE')}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm py-2.5 px-3 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Play size={14} fill="currentColor" /> Abrir Mesa
                        </button>
                    )
                ) : isLockedForMe ? (
                        /* ── Mesa bloqueada para este mesero ── */
                        <div className="flex flex-col items-center gap-1.5 py-2">
                            <div className="w-full bg-white/10 border border-white/20 rounded-xl py-3 px-3 flex items-center justify-center gap-2">
                                <Lock size={14} className="text-white/50" />
                                <span className="text-[11px] font-bold text-white/60">Mesa asignada a {staffName || 'otro mesero'}</span>
                            </div>
                        </div>
                ) : (
                        <div className="flex flex-col gap-1.5">
                        {/* Botón Piña: nueva partida (PINA o mixto con piñas) */}
                        {hasPinas && !isCheckoutPending && (
                            <div className="flex flex-col gap-1">
                                <button
                                    disabled={isProcessingCharge}
                                    onClick={async () => {
                                        const seats = session?.seats || [];
                                        const activeSeats = seats.filter(s => !s.paid);
                                        if (activeSeats.length > 0) {
                                            requestAttribution({ type: 'pina' });
                                        } else {
                                            await useTablesStore.getState().addRoundToSession(session.id);
                                        }
                                    }}
                                    className="w-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-black text-xs py-3 rounded-xl shadow-md transition-all whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    + Nueva Piña
                                </button>
                                {(currentUser?.role === 'ADMIN') && (Number(session?.extended_times) || 0) > 0 && (
                                    <button
                                        onClick={() => useTablesStore.getState().removeRoundFromSession(session.id)}
                                        className="w-full text-[10px] font-bold text-white/80 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400/30 transition-colors py-1 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap"
                                    >
                                        <X size={10} strokeWidth={2.5} /> Quitar última piña
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Botones modo mixto: agregar el modo faltante */}
                        {!isCheckoutPending && !isTimeFree && (
                            <div className="flex gap-1.5">
                                {/* Agregar Piña a sesión que no tiene piñas */}
                                {!hasPinas && (
                                    <button
                                        disabled={isProcessingCharge}
                                        onClick={async () => {
                                            const seats = session?.seats || [];
                                            const activeSeats = seats.filter(s => !s.paid);
                                            if (activeSeats.length > 0) {
                                                requestAttribution({ type: 'pina' });
                                            } else {
                                                await addPinaToSession(session.id);
                                            }
                                        }}
                                        className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 font-bold text-[10px] py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        <TargetIcon size={10} /> + Piña
                                    </button>
                                )}
                                {/* Agregar Hora a sesión que no tiene horas — oculto en libre */}
                                {!hasHoursActive && !costBreakdown?.isLibre && (
                                    <button
                                        onClick={() => setShowAddHoursModal(true)}
                                        className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1"
                                    >
                                        <Clock size={10} /> + Hora
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
                                {/* Admin y mesero pueden revertir la solicitud */}
                                <button
                                    onClick={() => cancelCheckoutRequest(session.id)}
                                    className="w-full text-[10px] font-bold text-slate-400 hover:text-rose-400 transition-colors py-1"
                                >
                                    Retirar solicitud
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                <div className={`grid gap-1.5 ${grandTotal > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    <button
                                        onClick={() => setShowOrderPanel(true)}
                                        className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[11px] sm:text-xs py-2.5 sm:py-2 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                        <ShoppingBag size={13} fill="currentColor" />
                                        <span>Consumo</span>
                                    </button>
                                    {grandTotal > 0 && (
                                    <button
                                        onClick={() => { requestCheckout(session.id); notifyMesaCobrar(table.name, grandTotal); }}
                                        className="bg-orange-500 hover:bg-orange-400 text-white font-bold text-[11px] sm:text-xs py-2.5 sm:py-2 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                        <CreditCard size={13} />
                                        <span>Cobrar</span>
                                    </button>
                                    )}
                                </div>

                                {/* Liberar mesa — cuando ya fue cobrada (paid_at) o deuda en $0 */}
                                {((session?.paid_at || grandTotal === 0) && isPlaying) && (
                                    !showReleaseConfirm ? (
                                        <button
                                            onClick={() => setShowReleaseConfirm(true)}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-[11px] py-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                        >
                                            <Check size={13} />
                                            Liberar mesa
                                        </button>
                                    ) : (
                                        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2 flex flex-col gap-2">
                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold text-center">¿Confirmar liberación de {table.name}?</p>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <button
                                                    onClick={() => setShowReleaseConfirm(false)}
                                                    className="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg py-1.5 transition-colors"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        setShowReleaseConfirm(false);
                                                        await closeSession(session.id, currentUser?.id || 'SYSTEM', 0);
                                                        showToast(`${table.name} liberada`, 'success');
                                                    }}
                                                    className="text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg py-1.5 transition-colors"
                                                >
                                                    Confirmar
                                                </button>
                                            </div>
                                        </div>
                                    )
                                )}
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

        {/* Modal Unificado de Modo de Juego — Piña / Hora / Ambos */}
        {/* ═══ WIZARD: Abrir Mesa ═══ */}
        <Modal isOpen={showOpenModal} onClose={() => { setShowOpenModal(false); setWizardStep(1); }} title={
            wizardStep === 1 ? 'Abrir Mesa' :
            wizardStep === 2 ? 'Modo de Juego' :
            wizardStep === 3 ? '¿A quién cobrar?' :
            'Confirmar Apertura'
        }>
            <div className="flex flex-col gap-4 py-2">

                {/* ── Step 1: Clientes ── */}
                {wizardStep === 1 && (
                    <>
                        <SeatEditor
                            seats={sessionSeats}
                            onSeatsChange={(s) => { setSeatValidationError(false); setSessionSeats(s); }}
                            onSearchCustomerForSeat={(idx) => { setSearchingSeatIndex(idx); setShowCustomerSheet(true); }}
                        />
                        {seatValidationError && (
                            <p className="text-xs font-bold text-red-500 animate-pulse px-1 -mt-2">
                                Cada cliente debe tener un nombre
                            </p>
                        )}
                        <button
                            onClick={() => {
                                if (sessionSeats.length > 0 && sessionSeats.some(s => !s.label?.trim())) {
                                    setSeatValidationError(true);
                                    return;
                                }
                                if (pendingOpen?.mode === 'SHOW_MODE') {
                                    setWizardStep(2);
                                } else {
                                    // Non-pool tables skip mode selection
                                    handleWizardFinish();
                                }
                            }}
                            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                        >
                            {pendingOpen?.mode === 'SHOW_MODE' ? 'Continuar' : (pendingOpen?.mode === 'CONSUMPTION' ? 'Ocupar Mesa' : 'Abrir Mesa')}
                        </button>
                    </>
                )}

                {/* ── Step 2: Modo de Juego (pool tables) ── */}
                {wizardStep === 2 && (
                    <>
                        {/* Toggles de modo */}
                        <div className="flex flex-col gap-2.5">
                            {/* Toggle Piña */}
                            <button
                                onClick={() => setModePina(!modePina)}
                                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                                    modePina
                                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 shadow-sm shadow-amber-200/50'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-amber-300'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    modePina ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                }`}>
                                    <TargetIcon size={20} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className={`font-black text-sm ${modePina ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        La Piña
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        ${config.pricePina || 0} por partida
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                    modePina ? 'bg-amber-500 border-amber-500' : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                    {modePina && <Check size={14} className="text-white" />}
                                </div>
                            </button>

                            {/* Toggle Hora */}
                            <button
                                onClick={() => { setModeHora(!modeHora); if (!modeHora) setSelectedHours(0); }}
                                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                                    modeHora
                                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 shadow-sm shadow-emerald-200/50'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    modeHora ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                }`}>
                                    <Clock size={20} />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className={`font-black text-sm ${modeHora ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        Por Hora
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        ${config.pricePerHour || 0}/hora · Prepago o libre
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                    modeHora ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                    {modeHora && <Check size={14} className="text-white" />}
                                </div>
                            </button>
                        </div>

                        {/* Selector de tiempo (solo si hora está activo) */}
                        {modeHora && (
                            <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seleccionar tiempo</span>
                                <button
                                    onClick={() => setSelectedHours(0)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                                        selectedHours === 0
                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-700 dark:text-emerald-400'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 text-slate-600 dark:text-slate-300'
                                    }`}
                                >
                                    <div className="font-black text-sm">Abierta (Libre)</div>
                                    <div className="text-xs opacity-70">Sin límite, cobro al final</div>
                                </button>
                                <div className="grid grid-cols-3 gap-2">
                                    {[0.5, 1, 2, 3, 4].map(h => (
                                        <button
                                            key={h}
                                            onClick={() => setSelectedHours(h)}
                                            className={`p-2.5 rounded-xl font-black transition-colors flex flex-col items-center justify-center ${
                                                selectedHours === h
                                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800'
                                            }`}
                                        >
                                            <span className="text-lg">{h === 0.5 ? '30' : h}</span>
                                            <span className="text-[10px] font-semibold opacity-70">{h === 0.5 ? 'MIN' : 'HRS'}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Resumen de selección */}
                        {(modePina || modeHora) && (
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span>Modo:</span>
                                <div className="flex gap-1.5">
                                    {modePina && <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">Piña</span>}
                                    {modePina && modeHora && <span>+</span>}
                                    {modeHora && <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">{selectedHours === 0 ? 'Libre' : selectedHours === 0.5 ? '30 min' : `${selectedHours}h`}</span>}
                                </div>
                            </div>
                        )}

                        {/* Botones Volver / Continuar */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setWizardStep(1)}
                                className="flex items-center justify-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={16} /> Volver
                            </button>
                            <button
                                onClick={() => {
                                    if (!modePina && !modeHora) return;
                                    // If 2+ clients and not mixed mode → go to attribution step
                                    const needsAttribution = sessionSeats.length > 1 && !(modePina && modeHora);
                                    if (needsAttribution) {
                                        setInitialChargeTarget(null);
                                        setWizardStep(3);
                                    } else {
                                        // Skip to confirm
                                        setWizardStep(4);
                                    }
                                }}
                                disabled={!modePina && !modeHora}
                                className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95 disabled:active:scale-100"
                            >
                                {!modePina && !modeHora ? 'Selecciona un modo' : 'Continuar'}
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 3: Atribución (¿A quién cobrar?) ── */}
                {wizardStep === 3 && (
                    <>
                        <p className="text-xs text-slate-500">
                            {modePina && !modeHora
                                ? '¿Quién paga la primera piña?'
                                : '¿Quién paga las primeras horas?'
                            }
                        </p>
                        {sessionSeats.map(seat => (
                            <button
                                key={seat.id || seat.label}
                                onClick={() => setInitialChargeTarget(seat.id || seat.label)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left active:scale-95 ${
                                    initialChargeTarget === (seat.id || seat.label)
                                        ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-400 shadow-sm'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-sky-300'
                                }`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                    initialChargeTarget === (seat.id || seat.label) ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                }`}>
                                    {(seat.label || 'C').charAt(0).toUpperCase()}
                                </div>
                                <span className={`font-bold text-sm ${
                                    initialChargeTarget === (seat.id || seat.label) ? 'text-sky-700 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'
                                }`}>{seat.label || `Cliente ${sessionSeats.indexOf(seat) + 1}`}</span>
                                {initialChargeTarget === (seat.id || seat.label) && <Check size={16} className="text-sky-500 ml-auto" />}
                            </button>
                        ))}
                        <button
                            onClick={() => setInitialChargeTarget(null)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed transition-all text-left active:scale-95 ${
                                initialChargeTarget === null
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-400'
                                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 hover:border-slate-400'
                            }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                initialChargeTarget === null ? 'bg-slate-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                            }`}>
                                <Users size={14} />
                            </div>
                            <div>
                                <p className={`font-bold text-sm ${initialChargeTarget === null ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>Compartido</p>
                                <p className="text-[10px] text-slate-400">Se divide entre todos al cobrar</p>
                            </div>
                            {initialChargeTarget === null && <Check size={16} className="text-slate-500 ml-auto" />}
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setWizardStep(2)}
                                className="flex items-center justify-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={16} /> Volver
                            </button>
                            <button
                                onClick={() => setWizardStep(4)}
                                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                            >
                                Continuar
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 4: Confirmar Apertura ── */}
                {wizardStep === 4 && (() => {
                    const modeLabel = modePina && modeHora
                        ? `Piña + ${selectedHours === 0 ? 'Libre' : selectedHours === 0.5 ? '30 min' : `${selectedHours}h`}`
                        : modePina ? 'La Piña'
                        : selectedHours === 0 ? 'Libre'
                        : selectedHours === 0.5 ? 'Prepago 30 min'
                        : `Prepago ${selectedHours}h`;
                    const clientsLabel = sessionSeats.length > 0
                        ? sessionSeats.map(s => s.label).join(', ')
                        : 'Sin registrar';
                    const chargeLabel = initialChargeTarget === null
                        ? 'Compartido'
                        : sessionSeats.find(s => (s.id || s.label) === initialChargeTarget)?.label || '?';
                    const showChargeInfo = sessionSeats.length > 1 && !(modePina && modeHora);

                    return (
                        <>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mesa</span>
                                    <span className="font-black text-slate-700 dark:text-white">{table.name}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modo</span>
                                    <span className="font-black text-slate-700 dark:text-white">{modeLabel}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clientes</span>
                                    <span className="font-bold text-slate-600 dark:text-slate-300 text-sm text-right max-w-[60%] truncate">{clientsLabel}</span>
                                </div>
                                {showChargeInfo && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primer cobro</span>
                                        <span className="font-bold text-sky-600 dark:text-sky-400 text-sm">{chargeLabel}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const needsAttribution = sessionSeats.length > 1 && !(modePina && modeHora);
                                        setWizardStep(needsAttribution ? 3 : 2);
                                    }}
                                    className="flex items-center justify-center gap-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronLeft size={16} /> Volver
                                </button>
                                <button
                                    onClick={handleWizardFinish}
                                    className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-black py-3.5 rounded-xl shadow-md transition-all active:scale-95"
                                >
                                    Abrir Mesa
                                </button>
                            </div>
                        </>
                    );
                })()}
            </div>
        </Modal>

        {/* Modal Editar nombre y personas de sesión activa */}
        <Modal isOpen={showEditMetaModal} onClose={() => setShowEditMetaModal(false)} title="Editar Información de Mesa">
            <div className="flex flex-col gap-4 py-2">
                {/* Cliente clásico — solo si NO hay asientos multi-cliente */}
                {editSeats.length === 0 && (
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Cliente</label>
                    {editClientId ? (
                        <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/40 rounded-xl">
                            <div className="flex items-center gap-2">
                                <UserCheck size={16} className="text-sky-600" />
                                <div>
                                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300">
                                        {allCustomers.find(c => c.id === editClientId)?.name || editClientName}
                                    </p>
                                    {allCustomers.find(c => c.id === editClientId)?.documentId && (
                                        <p className="text-[11px] text-sky-500">{allCustomers.find(c => c.id === editClientId).documentId}</p>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => { setEditClientId(null); setEditClientName(''); }} className="p-1 rounded-full text-sky-500 hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowEditCustomerSheet(true)}
                            className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-all text-left"
                        >
                            <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                <Users size={16} className="text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Sin cliente asignado</p>
                                <p className="text-xs text-slate-400">Toca para buscar o crear</p>
                            </div>
                            <Search size={14} className="text-slate-400 shrink-0" />
                        </button>
                    )}
                </div>
                )}
                <div>
                    <SeatEditor
                        seats={editSeats}
                        onSeatsChange={setEditSeats}
                        onSearchCustomerForSeat={(idx) => { setSearchingEditSeatIndex(idx); setShowEditCustomerSheet(true); }}
                        isPoolTable={table.type !== 'NORMAL'}
                    />
                </div>
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5 flex items-center gap-1">
                        <MessageSquare size={10} /> Nota
                    </label>
                    <textarea
                        placeholder="Ej: Cumpleaños, mesa reservada, nota especial..."
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        maxLength={200}
                        rows={2}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none"
                    />
                    <p className="text-[10px] text-slate-400 text-right mt-0.5">{editNotes.length}/200</p>
                </div>
                <button
                    onClick={async () => {
                        const name = editClientId ? (allCustomers.find(c => c.id === editClientId)?.name || editClientName) : editClientName.trim();
                        const guestCount = editSeats.length > 0 ? editSeats.length : (parseInt(editGuestCount) || 0);
                        await updateSessionMetadata(session.id, name, guestCount, editClientId, editNotes.trim());
                        await updateSessionSeats(session.id, editSeats);
                        setShowEditMetaModal(false);
                        showToast('Información actualizada', 'success');
                    }}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                >
                    Guardar
                </button>
            </div>
        </Modal>

        {/* Modal Modificar Tiempo / Partidas */}
        <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title={isMixedMode ? "Agregar Tiempo" : hasPinas && !hasHoursActive ? "Añadir Piñas" : "Modificar Tiempo"}>
            <div className="flex flex-col gap-4 py-2">
                {/* Sección Piñas — solo visible en modo PINA puro (mixto usa botón dedicado "+ Nueva Piña") */}
                {(hasPinas && !isMixedMode) && (
                    <button
                        disabled={isProcessingCharge}
                        onClick={async () => {
                            const seats = session?.seats || [];
                            const activeSeats = seats.filter(s => !s.paid);
                            if (activeSeats.length > 0) {
                                setShowAdjustModal(false);
                                requestAttribution({ type: 'pina' });
                            } else {
                                await useTablesStore.getState().addRoundToSession(session.id);
                                setShowAdjustModal(false);
                            }
                        }}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-black py-4 rounded-xl border border-amber-500/20 shadow-sm flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <TargetIcon size={20} /> + 1 Piña
                    </button>
                )}

                {/* Sección Tiempo — visible si tiene horas (mixto o prepago) */}
                {hasHoursActive && hasLimit && (
                    <div className="flex flex-col gap-2">
                        {!isMixedMode && (
                            <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Esta mesa tiene un prepago. Puede ajustar el tiempo:
                            </p>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agregar</span>
                        <div className="grid grid-cols-2 gap-2">
                            {[0.5, 1, 2, 3].map(h => (
                                <button key={h} disabled={isProcessingCharge} onClick={async () => {
                                    const seats = session?.seats || [];
                                    const activeSeats = seats.filter(s => !s.paid);
                                    if (activeSeats.length > 0) {
                                        setShowAdjustModal(false);
                                        requestAttribution({ type: 'hora', hoursValue: h });
                                    } else {
                                        await useTablesStore.getState().addHoursToSession(session.id, h);
                                        setShowAdjustModal(false);
                                    }
                                }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl disabled:opacity-50 disabled:pointer-events-none">
                                    + {h === 0.5 ? '30 Min' : h === 1 ? '1 Hora' : `${h} Horas`}
                                </button>
                            ))}
                        </div>
                        {(currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO') && (
                            <>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Restar</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, -0.5); setShowAdjustModal(false); }} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-3 rounded-xl">− 30 Min</button>
                                    <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, -1); setShowAdjustModal(false); }} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-3 rounded-xl">− 1 Hora</button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Solo piña puro sin horas y no mixto — no mostrar nada extra */}
                {!hasPinas && !hasHoursActive && !hasLimit && (
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

        {/* Modal: Agregar Hora a sesión activa (modo mixto) */}
        <Modal isOpen={showAddHoursModal} onClose={() => setShowAddHoursModal(false)} title="Agregar Tiempo">
            <div className="flex flex-col gap-3 py-2">
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    Agregar tiempo prepago a esta mesa. El costo se sumará al total de la cuenta.
                </p>
                <div className="grid grid-cols-2 gap-2">
                    {[0.5, 1, 2, 3, 4].map(h => (
                        <button
                            key={h}
                            disabled={isProcessingCharge}
                            onClick={async () => {
                                setShowAddHoursModal(false);
                                const seats = session?.seats || [];
                                const activeSeats = seats.filter(s => !s.paid);
                                if (activeSeats.length > 0) {
                                    requestAttribution({ type: 'hora', hoursValue: h });
                                } else {
                                    await addHoursToSession(session?.id, h);
                                    showToast(`${h === 0.5 ? '30 min' : h + 'h'} agregadas`, 'success');
                                }
                            }}
                            className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center"
                        >
                            <span className="text-xl">{h === 0.5 ? '30' : h}</span>
                            <span className="text-[10px] font-semibold opacity-70">{h === 0.5 ? 'MIN' : h === 1 ? 'HORA' : 'HORAS'}</span>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>

        {/* Modal: Atribución de tiempo a cliente */}
        <Modal isOpen={showAttributeModal} onClose={() => { if (!isProcessingCharge) { setShowAttributeModal(false); setPendingCharge(null); } }} title={pendingCharge?.type === 'hora' ? 'Agregar Hora — ¿A quién cobrar?' : 'Nueva Piña — ¿A quién cobrar?'}>
            <div className="flex flex-col gap-2 py-2">
                <p className="text-xs text-slate-500 mb-1">Selecciona el cliente que paga este tiempo, o elige Compartido para dividirlo entre todos.</p>
                {(session?.seats || []).filter(s => !s.paid).map(seat => (
                    <button
                        key={seat.id}
                        disabled={isProcessingCharge}
                        onClick={() => handleAttributeCharge(seat.id)}
                        className="w-full flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/40 rounded-xl hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-all text-left active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shrink-0">
                            {(seat.label || 'C').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-sky-700 dark:text-sky-300 text-sm">{seat.label || `Cliente ${(session?.seats || []).indexOf(seat) + 1}`}</span>
                    </button>
                ))}
                <button
                    disabled={isProcessingCharge}
                    onClick={() => handleAttributeCharge(null)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-left active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                    <div className="w-8 h-8 rounded-full bg-slate-400 text-white flex items-center justify-center text-xs font-black shrink-0">
                        <Users size={14} />
                    </div>
                    <div>
                        <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">Compartido</p>
                        <p className="text-[10px] text-slate-400">Se divide entre todos al cobrar</p>
                    </div>
                </button>
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
                {/* Piñas — visible si la sesión tiene piñas */}
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

                {/* Tiempo — visible si la sesión tiene horas */}
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

                {/* Tiempo/Piña fallback para mesas sin breakdown */}
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

                {/* Equivalente Bs */}
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
                    onClick={() => setShowTotalDetails(false)}
                    className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors"
                >
                    Cerrar Detalle
                </button>
            </div>
        </Modal>

        {/* Confirmación Piña — solo para MESERO */}
        <Modal isOpen={showPinaConfirm} onClose={() => setShowPinaConfirm(false)} title="Confirmar Piña">
            <div className="flex flex-col gap-4 py-2">
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <span className="text-3xl">🎱</span>
                    <div>
                        <p className="font-black text-slate-800 text-sm">{table.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Se abrirá en modo <strong>Piña</strong> (precio fijo por partida).</p>
                    </div>
                </div>
                <p className="text-xs text-slate-500 text-center">¿Confirmas que quieres abrir esta mesa en modo Piña?</p>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowPinaConfirm(false)}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => { setShowPinaConfirm(false); handleStartPina(); }}
                        className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-md shadow-amber-500/20"
                    >
                        Sí, abrir Piña
                    </button>
                </div>
            </div>
        </Modal>

        {/* CustomerSheet para Abrir Mesa (y buscar cliente por seat) */}
        {showCustomerSheet && (
            <CustomerSheet
                customers={allCustomers}
                selectedId={searchingSeatIndex !== null ? sessionSeats[searchingSeatIndex]?.customerId : sessionClientId}
                onSelect={id => {
                    if (searchingSeatIndex !== null) {
                        const customer = allCustomers.find(c => c.id === id);
                        const updated = sessionSeats.map((s, i) =>
                            i === searchingSeatIndex
                                ? { ...s, customerId: id, label: s.label || customer?.name || '' }
                                : s
                        );
                        setSessionSeats(updated);
                        setSearchingSeatIndex(null);
                    } else {
                        setSessionClientId(id);
                    }
                }}
                onClose={() => { setShowCustomerSheet(false); setSearchingSeatIndex(null); }}
                onCreateCustomer={handleCreateCustomer}
            />
        )}

        {/* CustomerSheet para Editar Mesa */}
        {showEditCustomerSheet && (
            <CustomerSheet
                customers={allCustomers}
                selectedId={searchingEditSeatIndex !== null ? editSeats[searchingEditSeatIndex]?.customerId : editClientId}
                onSelect={id => {
                    if (searchingEditSeatIndex !== null) {
                        const customer = allCustomers.find(c => c.id === id);
                        const updated = editSeats.map((s, i) =>
                            i === searchingEditSeatIndex
                                ? { ...s, customerId: id, label: s.label || customer?.name || '' }
                                : s
                        );
                        setEditSeats(updated);
                        setSearchingEditSeatIndex(null);
                    } else {
                        setEditClientId(id);
                        setEditClientName(allCustomers.find(c => c.id === id)?.name || '');
                    }
                }}
                onClose={() => { setShowEditCustomerSheet(false); setSearchingEditSeatIndex(null); }}
                onCreateCustomer={handleCreateCustomer}
            />
        )}

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
