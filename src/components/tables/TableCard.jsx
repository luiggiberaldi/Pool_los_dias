import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Timer, DollarSign, Activity, ShoppingBag, Edit2, Printer, X, AlertTriangle, CreditCard, Clock, Eye, Users, Search, UserCheck, UserPlus, Check, Phone, Pause, Lock, MessageSquare } from 'lucide-react';
import { calculateElapsedTime, calculateSessionCost, formatElapsedTime, calculateTimeCostBs, calculateGrandTotalBs } from '../../utils/tableBillingEngine';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useNotifications } from '../../hooks/useNotifications';
import { useCustomersStore } from '../../hooks/store/useCustomersStore';
import { OrderPanel } from './OrderPanel';

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
    const { config, openSession, closeSession, requestCheckout, cancelCheckoutRequest, updateSessionMetadata, updateSessionTime } = useTablesStore();
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const tasaUSD = useBcvRate();
    const { currentUser } = useAuthStore();
    const staffName = useStaffName(session?.opened_by);
    const confirm = useConfirm();
    const { notifyMesaCobrar, notifyTiempoExcedido } = useNotifications();

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

    // Modal de nombre + personas al abrir mesa
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(null);
    const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
    const [sessionClientName, setSessionClientName] = useState('');
    const [sessionGuestCount, setSessionGuestCount] = useState('');
    const [sessionClientId, setSessionClientId] = useState(null);
    const [showCustomerSheet, setShowCustomerSheet] = useState(false);
    const { customers: allCustomers, fetchCustomers, createCustomer, refresh: refreshCustomers } = useCustomersStore();

    // Modal de edición de nombre + personas en sesión activa
    const [showEditMetaModal, setShowEditMetaModal] = useState(false);
    const [editClientName, setEditClientName] = useState('');
    const [editGuestCount, setEditGuestCount] = useState('');
    const [editClientId, setEditClientId] = useState(null);
    const [editNotes, setEditNotes] = useState('');
    const [showEditCustomerSheet, setShowEditCustomerSheet] = useState(false);


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
    const pauseKey = session ? `table_pause_${session.id}` : null;
    const [isPaused, setIsPaused] = useState(() => {
        if (!session) return false;
        try { return JSON.parse(localStorage.getItem(`table_pause_${session.id}`))?.isPaused ?? false; }
        catch { return false; }
    });
    const [pauseElapsed, setPauseElapsed] = useState(() => {
        if (!session) return 0;
        try { return JSON.parse(localStorage.getItem(`table_pause_${session.id}`))?.elapsedAtPause ?? 0; }
        catch { return 0; }
    });

    // Escuchar pausa/reanudación global desde TablesView
    useEffect(() => {
        const handleGlobalPause = () => {
            if (!pauseKey) return;
            try {
                const data = JSON.parse(localStorage.getItem(pauseKey));
                if (data?.isPaused && !isPaused) {
                    setIsPaused(true);
                    setPauseElapsed(data.elapsedAtPause);
                    setElapsed(data.elapsedAtPause);
                } else if (!data && isPaused) {
                    setIsPaused(false);
                }
            } catch {}
        };
        window.addEventListener('storage', handleGlobalPause);
        return () => window.removeEventListener('storage', handleGlobalPause);
    }, [pauseKey, isPaused]);

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
        if (!pauseKey) return;
        const currentElapsed = calculateElapsedTime(session.started_at);
        setIsPaused(true);
        setPauseElapsed(currentElapsed);
        setElapsed(currentElapsed);
        localStorage.setItem(pauseKey, JSON.stringify({ isPaused: true, elapsedAtPause: currentElapsed }));
    };

    const handleResumeTimer = async () => {
        if (!pauseKey) return;
        try {
            const saved = JSON.parse(localStorage.getItem(pauseKey));
            if (saved) {
                // Calcular cuántos minutos estuvo pausado
                const currentElapsed = calculateElapsedTime(session.started_at);
                const pausedMinutes = currentElapsed - saved.elapsedAtPause;
                // Mover started_at hacia adelante para compensar la pausa
                const newStartedAt = new Date(new Date(session.started_at).getTime() + pausedMinutes * 60000).toISOString();
                await updateSessionTime(session.id, newStartedAt);
            }
        } catch (e) { console.warn('Error reanudando timer', e); }
        setIsPaused(false);
        if (pauseKey) localStorage.removeItem(pauseKey);
    };

    const handleStartNormal = async (hours = 0, clientName = '', guestCount = 0, clientId = null) => {
        if (!currentUser) return;
        const modeLabel = hours === 0 ? 'Libre' : hours === 0.5 ? 'Prepago 30 min' : `Prepago ${hours} hr${hours !== 1 ? 's' : ''}`;
        const ok = await confirm({ title: `Abrir ${table.name}`, message: `¿Confirmar apertura en modo ${modeLabel}?`, confirmText: 'Abrir Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'NORMAL', hours, clientName, guestCount, clientId);
        setShowModeModal(false);
    };

    const handleStartPina = async (clientName = '', guestCount = 0, clientId = null) => {
        if (!currentUser) return;
        const ok = await confirm({ title: `Abrir ${table.name}`, message: '¿Confirmar apertura en modo La Piña?', confirmText: 'Abrir Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'PINA', 0, clientName, guestCount, clientId);
    };

    const handleStartConsumption = async (clientName = '', guestCount = 0, clientId = null) => {
        if (!currentUser) return;
        const ok = await confirm({ title: `Ocupar ${table.name}`, message: '¿Confirmar apertura de mesa?', confirmText: 'Ocupar Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'NORMAL', 0, clientName, guestCount, clientId);
    };

    // Abre el modal de nombre/personas y guarda la acción pendiente
    const handleRequestOpen = (mode, hours = 0) => {
        setSessionClientName('');
        setSessionGuestCount('');
        setSessionClientId(null);
        refreshCustomers();
        setPendingOpen({ mode, hours });
        setShowOpenModal(true);
    };

    const handleCreateCustomer = async (name, phone, documentId) => {
        const newCustomer = await createCustomer(name, phone, documentId);
        return newCustomer;
    };

    const handleConfirmOpen = async () => {
        if (!pendingOpen) return;
        setShowOpenModal(false);
        const name = sessionClientId
            ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim())
            : sessionClientName.trim();
        const guests = parseInt(sessionGuestCount) || 0;
        const { mode, hours } = pendingOpen;
        if (mode === 'PINA') await handleStartPina(name, guests, sessionClientId);
        else if (mode === 'CONSUMPTION') await handleStartConsumption(name, guests, sessionClientId);
        else await handleStartNormal(hours, name, guests, sessionClientId);
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
                            onClick={() => { setEditClientName(session.client_name || ''); setEditGuestCount(session.guest_count > 0 ? String(session.guest_count) : ''); setEditClientId(session.client_id || null); setEditNotes(session.notes || ''); setShowEditMetaModal(true); }}
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
                            onClick={() => { setEditClientName(''); setEditGuestCount(''); setEditClientId(null); setEditNotes(session?.notes || ''); setShowEditMetaModal(true); }}
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
                    isAvailable ? 'bg-emerald-100 text-emerald-700' : hasLimit ? 'bg-amber-400 text-slate-900 border border-amber-300' : 'bg-white/20 text-white backdrop-blur-md'
                }`}>
                    {isAvailable ? 'LIBRE' : session.game_mode === 'PINA' ? 'LA PIÑA' : isTimeFree ? 'BAR' : hasLimit ? (session.hours_paid === 0.5 ? 'PREPAGO 30MIN' : `PREPAGO ${Number(session.hours_paid)}h`) : 'JUG.'}
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
                        ) : (
                            <>
                                {session.game_mode === 'PINA' ? (
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
                                        Bs. {calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        {session.game_mode === 'PINA' && (() => {
                            const totalRounds = 1 + (Number(session.extended_times) || 0);
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
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                data-tour="mesa-btn-normal"
                                onClick={() => handleRequestOpen('SHOW_MODE')}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] sm:text-xs py-2.5 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <Play size={12} fill="currentColor" /> Normal
                            </button>
                            <button
                                data-tour="mesa-btn-pina"
                                onClick={currentUser?.role === 'MESERO' ? () => setShowPinaConfirm(true) : () => handleRequestOpen('PINA')}
                                className="bg-amber-500 hover:bg-amber-400 text-white font-bold text-[11px] sm:text-xs py-2.5 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <TargetIcon size={12} /> Piña
                            </button>
                        </div>
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
                        {/* Botón exclusivo Piña: nueva partida */}
                        {session?.game_mode === 'PINA' && !isCheckoutPending && (
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={async () => {
                                        await useTablesStore.getState().addRoundToSession(session.id);
                                    }}
                                    className="w-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-black text-xs py-3 rounded-xl shadow-md transition-all whitespace-nowrap"
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

        {/* Modal de Elegir Tiempo Prepago */}
        <Modal isOpen={showModeModal} onClose={() => setShowModeModal(false)} title="Modo de Juego">
            <div className="flex flex-col gap-3 py-2">
                <button
                    onClick={() => { const n=sessionClientId ? (allCustomers.find(c=>c.id===sessionClientId)?.name||sessionClientName) : sessionClientName; const g=parseInt(sessionGuestCount)||0; handleStartNormal(0, n, g, sessionClientId); }}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-sky-500 hover:bg-sky-50/50 group transition-all"
                >
                    <div className="font-black text-slate-800 group-hover:text-sky-700">Abierta (Libre)</div>
                    <div className="text-sm text-slate-500">Mesa por tiempo ilimitado, cobro al final.</div>
                </button>
                <div className="grid grid-cols-2 gap-3 mt-2">
                    <button onClick={() => { const n=sessionClientId?(allCustomers.find(c=>c.id===sessionClientId)?.name||sessionClientName):sessionClientName; const g=parseInt(sessionGuestCount)||0; handleStartNormal(0.5, n, g, sessionClientId); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">30 Min</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => { const n=sessionClientId?(allCustomers.find(c=>c.id===sessionClientId)?.name||sessionClientName):sessionClientName; const g=parseInt(sessionGuestCount)||0; handleStartNormal(1, n, g, sessionClientId); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">1 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => { const n=sessionClientId?(allCustomers.find(c=>c.id===sessionClientId)?.name||sessionClientName):sessionClientName; const g=parseInt(sessionGuestCount)||0; handleStartNormal(2, n, g, sessionClientId); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">2 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => { const n=sessionClientId?(allCustomers.find(c=>c.id===sessionClientId)?.name||sessionClientName):sessionClientName; const g=parseInt(sessionGuestCount)||0; handleStartNormal(3, n, g, sessionClientId); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">3 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                    <button onClick={() => { const n=sessionClientId?(allCustomers.find(c=>c.id===sessionClientId)?.name||sessionClientName):sessionClientName; const g=parseInt(sessionGuestCount)||0; handleStartNormal(4, n, g, sessionClientId); }} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200 p-3 rounded-xl font-black transition-colors flex flex-col items-center justify-center">
                        <span className="text-xl">4 Hrs</span>
                        <span className="text-xs font-semibold opacity-70 mt-0.5">PREPAGO</span>
                    </button>
                </div>
            </div>
        </Modal>

        {/* Modal de Nombre + Personas al abrir mesa */}
        <Modal isOpen={showOpenModal} onClose={() => setShowOpenModal(false)} title="Abrir Mesa">            <div className="flex flex-col gap-4 py-2">
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Cliente (opcional)</label>
                    {sessionClientId ? (
                        <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/40 rounded-xl">
                            <div className="flex items-center gap-2">
                                <UserCheck size={16} className="text-sky-600" />
                                <div>
                                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300">
                                        {allCustomers.find(c => c.id === sessionClientId)?.name || 'Cliente'}
                                    </p>
                                    {allCustomers.find(c => c.id === sessionClientId)?.documentId && (
                                        <p className="text-[11px] text-sky-500">{allCustomers.find(c => c.id === sessionClientId).documentId}</p>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setSessionClientId(null)} className="p-1 rounded-full text-sky-500 hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowCustomerSheet(true)}
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
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Número de personas (opcional)</label>
                    <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={sessionGuestCount}
                        onChange={e => setSessionGuestCount(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    />
                </div>
                <button
                    onClick={() => {
                        if (pendingOpen?.mode === 'SHOW_MODE') {
                            setShowOpenModal(false);
                            setShowModeModal(true);
                        } else {
                            handleConfirmOpen();
                        }
                    }}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                >
                    Continuar
                </button>
            </div>
        </Modal>

        {/* Modal Editar nombre y personas de sesión activa */}
        <Modal isOpen={showEditMetaModal} onClose={() => setShowEditMetaModal(false)} title="Editar Información de Mesa">
            <div className="flex flex-col gap-4 py-2">
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
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Número de personas</label>
                    <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={editGuestCount}
                        onChange={e => setEditGuestCount(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
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
                        await updateSessionMetadata(session.id, name, parseInt(editGuestCount) || 0, editClientId, editNotes.trim());
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
        <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title={session?.game_mode === 'PINA' ? "Añadir Piñas" : "Modificar Tiempo"}>
            <div className="flex flex-col gap-4 py-2">
                {session?.game_mode === 'PINA' ? (
                    <>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">
                            Añade más piñas a esta mesa sin tener que cerrarla y volverla a abrir.
                        </p>
                        <button 
                            onClick={async () => { await useTablesStore.getState().addRoundToSession(session.id); setShowAdjustModal(false); }} 
                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-black py-4 rounded-xl border border-amber-500/20 shadow-sm flex items-center justify-center gap-2 text-lg"
                        >
                            <TargetIcon size={20} /> + 1 Piña
                        </button>
                    </>
                ) : hasLimit ? (
                    <>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">
                            Esta mesa tiene un prepago. Puede ajustar el tiempo:
                        </p>
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agregar</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 0.5); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 30 Min</button>
                                <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 1); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 1 Hora</button>
                                <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 2); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 2 Horas</button>
                                <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, 3); setShowAdjustModal(false); }} className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 font-bold py-3 rounded-xl">+ 3 Horas</button>
                            </div>
                            {currentUser?.role === 'ADMIN' && (
                                <>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Restar</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, -0.5); setShowAdjustModal(false); }} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-3 rounded-xl">− 30 Min</button>
                                        <button onClick={async () => { await useTablesStore.getState().addHoursToSession(session.id, -1); setShowAdjustModal(false); }} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold py-3 rounded-xl">− 1 Hora</button>
                                    </div>
                                </>
                            )}
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
                            {session?.game_mode === 'PINA' ? 'Piñas jugadas' : 'Tiempo de Juego'}
                        </span>
                        <div className="flex flex-col items-end">
                            <span className="text-lg font-black">${timeCost.toFixed(2)}</span>
                            <span className="text-xs font-medium text-slate-400">Bs. {calculateTimeCostBs(timeCost, session?.game_mode, config, tasaUSD).toFixed(2)}</span>
                        </div>
                    </div>
                    <span className="text-xs text-slate-500">
                         {session?.game_mode === 'PINA' ? `${1 + (Number(session?.extended_times) || 0)} piña(s)` : `${formatElapsedTime(elapsed)} horas jugadas`}
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
                        <span className="text-xs font-bold text-emerald-600/70 dark:text-emerald-400/70 pt-1">Tasa BCV: Bs. {Number(tasaUSD).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none mb-1">
                            ${grandTotal.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-emerald-600/80 dark:text-emerald-400/80">
                            Bs. {calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD).toFixed(2)}
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

        {/* CustomerSheet para Abrir Mesa */}
        {showCustomerSheet && (
            <CustomerSheet
                customers={allCustomers}
                selectedId={sessionClientId}
                onSelect={id => setSessionClientId(id)}
                onClose={() => setShowCustomerSheet(false)}
                onCreateCustomer={handleCreateCustomer}
            />
        )}

        {/* CustomerSheet para Editar Mesa */}
        {showEditCustomerSheet && (
            <CustomerSheet
                customers={allCustomers}
                selectedId={editClientId}
                onSelect={id => {
                    setEditClientId(id);
                    setEditClientName(allCustomers.find(c => c.id === id)?.name || '');
                }}
                onClose={() => setShowEditCustomerSheet(false)}
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
