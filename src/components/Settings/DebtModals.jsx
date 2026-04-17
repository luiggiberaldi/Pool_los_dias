import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../Modal';
import { useDebtsStore } from '../../hooks/store/useDebtsStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useProductContext } from '../../context/ProductContext';
import { showToast } from '../Toast';
import { DollarSign, Plus, Clock, CheckCircle, Trash2, CreditCard, ArrowLeft, Search, Loader2 } from 'lucide-react';
import { ROLE_CONFIG } from './UserPinInput';

const fmtBs = (usd, rate) => rate > 0 ? (usd * rate).toFixed(2) : null;

// ── Modal: Agregar Deuda ──────────────────────────────────────
export function AddDebtModal({ isOpen, onClose }) {
    const { cachedUsers } = useAuthStore();
    const { createDebt } = useDebtsStore();
    const { effectiveRate } = useProductContext();
    const [step, setStep] = useState(1);
    const [staffId, setStaffId] = useState('');
    const [concept, setConcept] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const conceptRef = useRef(null);

    useEffect(() => {
        if (isOpen) { setStep(1); setStaffId(''); setConcept(''); setAmount(''); setCurrency('USD'); setSearch(''); }
    }, [isOpen]);

    useEffect(() => {
        if (step === 2 && conceptRef.current) conceptRef.current.focus();
    }, [step]);

    const activeUsers = cachedUsers.filter(u => u.active !== false);
    const filtered = search
        ? activeUsers.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()))
        : activeUsers;
    const selectedUser = activeUsers.find(u => u.id === staffId);
    const canSubmit = staffId && concept.trim() && Number(amount) > 0 && !saving;

    const selectUser = (id) => { setStaffId(id); setStep(2); };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        try {
            const rawAmt = Number(amount);
            const usdAmount = currency === 'BS' && effectiveRate > 0
                ? Math.round((rawAmt / effectiveRate) * 100) / 100
                : rawAmt;
            await createDebt(staffId, concept, usdAmount);
            showToast('Deuda registrada', 'success');
            onClose();
        } catch (err) {
            console.error(err);
            showToast('Error al registrar deuda', 'error');
        } finally { setSaving(false); }
    };

    const quickAmountsUSD = [1, 2, 5, 10, 20];
    const quickAmountsBs = [10, 20, 50, 100, 200];
    const quickAmounts = currency === 'BS' ? quickAmountsBs : quickAmountsUSD;

    // Preview conversion
    const rawAmt = Number(amount) || 0;
    const previewUsd = currency === 'BS' && effectiveRate > 0 ? rawAmt / effectiveRate : rawAmt;
    const previewBs = currency === 'USD' && effectiveRate > 0 ? rawAmt * effectiveRate : rawAmt;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={step === 1 ? '¿Quién debe?' : 'Registrar Deuda'}>
            {step === 1 ? (
                <div className="space-y-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar empleado..."
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                            autoFocus />
                    </div>
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                        {filtered.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-6">No se encontraron empleados</p>
                        ) : (
                            filtered.map(u => {
                                const conf = ROLE_CONFIG[u.role] || ROLE_CONFIG.CAJERO;
                                const initial = (u.name || 'U')[0].toUpperCase();
                                return (
                                    <button key={u.id} onClick={() => selectUser(u.id)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-rose-300 hover:bg-rose-50/50 dark:hover:bg-rose-900/10 transition-all active:scale-[0.98]">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${conf.gradient} flex items-center justify-center shrink-0`}>
                                            <span className="text-white font-black text-sm">{initial}</span>
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                                                {u.name?.charAt(0).toUpperCase() + u.name?.slice(1).toLowerCase()}
                                            </p>
                                            <p className={`text-[10px] font-bold uppercase tracking-wider ${conf.text}`}>
                                                {conf.label}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Empleado seleccionado */}
                    <button onClick={() => setStep(1)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/30 transition-all hover:bg-rose-100">
                        <ArrowLeft size={14} className="text-rose-400 shrink-0" />
                        {selectedUser && (() => {
                            const conf = ROLE_CONFIG[selectedUser.role] || ROLE_CONFIG.CAJERO;
                            return (
                                <>
                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${conf.gradient} flex items-center justify-center shrink-0`}>
                                        <span className="text-white font-black text-xs">{(selectedUser.name || 'U')[0].toUpperCase()}</span>
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                                            {selectedUser.name?.charAt(0).toUpperCase() + selectedUser.name?.slice(1).toLowerCase()}
                                        </p>
                                        <p className="text-[10px] text-rose-400 font-bold">Toca para cambiar</p>
                                    </div>
                                </>
                            );
                        })()}
                    </button>

                    {/* Concepto */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">¿Qué se llevó?</label>
                        <input ref={conceptRef} type="text" value={concept} onChange={e => setConcept(e.target.value)}
                            placeholder="Ej: 4x Zulia, 2 horas mesa 3..."
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30" />
                    </div>

                    {/* Monto */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Monto</label>
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 mb-2">
                            <button onClick={() => { setCurrency('USD'); setAmount(''); }}
                                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                                    currency === 'USD'
                                        ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                }`}>
                                $ USD
                            </button>
                            <button onClick={() => { setCurrency('BS'); setAmount(''); }}
                                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                                    currency === 'BS'
                                        ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm'
                                        : 'text-slate-400 hover:text-slate-600'
                                }`}>
                                Bs
                            </button>
                        </div>
                        <div className="relative">
                            {currency === 'USD'
                                ? <DollarSign size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rose-400" />
                                : <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500 font-black text-sm">Bs</span>
                            }
                            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-3 py-3 text-lg font-black text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30" />
                        </div>
                        {/* Conversion preview */}
                        {rawAmt > 0 && effectiveRate > 0 && (
                            <div className="mt-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5 text-center">
                                {currency === 'BS' ? (
                                    <p className="text-[11px] text-slate-500">
                                        ≈ <span className="font-bold text-emerald-600">${previewUsd.toFixed(2)} USD</span>
                                        <span className="text-slate-300 mx-1.5">·</span>
                                        <span className="text-slate-400">Tasa: {effectiveRate.toFixed(2)} Bs/$</span>
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-slate-500">
                                        ≈ <span className="font-bold text-blue-600">Bs {previewBs.toFixed(2)}</span>
                                        <span className="text-slate-300 mx-1.5">·</span>
                                        <span className="text-slate-400">Tasa: {effectiveRate.toFixed(2)} Bs/$</span>
                                    </p>
                                )}
                            </div>
                        )}
                        {/* Quick amounts */}
                        <div className="flex gap-1.5 mt-2">
                            {quickAmounts.map(q => (
                                <button key={q} onClick={() => setAmount(String(q))}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                                        Number(amount) === q
                                            ? 'bg-rose-500 text-white shadow-sm'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
                                    }`}>
                                    {currency === 'BS' ? `${q}` : `$${q}`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 font-black text-sm uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-rose-500/20 disabled:shadow-none flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={3} />}
                        {saving ? 'Guardando...' : 'Registrar Deuda'}
                    </button>
                </div>
            )}
        </Modal>
    );
}

// ── Modal: Detalle de Deuda + Historial ───────────────────────
export function DebtDetailModal({ debt, onClose }) {
    const { fetchPayments, payments, addPayment, deleteDebt } = useDebtsStore();
    const { effectiveRate } = useProductContext();
    const [showPayForm, setShowPayForm] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payCurrency, setPayCurrency] = useState('USD');
    const [payNote, setPayNote] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (debt) {
            fetchPayments(debt.id);
            setShowPayForm(false);
            setPayAmount('');
            setPayCurrency('USD');
            setPayNote('');
        }
    }, [debt?.id]);

    if (!debt) return null;

    const debtPayments = payments[debt.id] || [];
    const isPaid = debt.status === 'paid';
    const amountUsd = Number(debt.amount_usd);
    const remainingUsd = Number(debt.remaining_usd);
    const amountBs = fmtBs(amountUsd, effectiveRate);
    const remainingBs = fmtBs(remainingUsd, effectiveRate);
    const progressPct = amountUsd > 0 ? Math.min(((amountUsd - remainingUsd) / amountUsd) * 100, 100) : 0;

    const handlePay = async () => {
        const raw = Number(payAmount);
        if (raw <= 0) return;
        const usdAmt = payCurrency === 'BS' && effectiveRate > 0
            ? Math.round((raw / effectiveRate) * 100) / 100
            : raw;
        if (usdAmt > debt.remaining_usd) return;
        setSaving(true);
        try {
            await addPayment(debt.id, usdAmt, payNote);
            showToast('Abono registrado', 'success');
            setShowPayForm(false);
            setPayAmount('');
            setPayNote('');
        } catch (err) {
            console.error(err);
            showToast('Error al registrar abono', 'error');
        } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!confirm('¿Eliminar esta deuda y todos sus abonos?')) return;
        try {
            await deleteDebt(debt.id);
            showToast('Deuda eliminada', 'success');
            onClose();
        } catch (err) {
            console.error(err);
            showToast('Error al eliminar', 'error');
        }
    };

    // Pay form validation
    const payRaw = Number(payAmount) || 0;
    const payUsdPreview = payCurrency === 'BS' && effectiveRate > 0 ? payRaw / effectiveRate : payRaw;
    const payBsPreview = payCurrency === 'USD' && effectiveRate > 0 ? payRaw * effectiveRate : payRaw;
    const payValid = payRaw > 0 && payUsdPreview <= debt.remaining_usd + 0.01;

    return (
        <Modal isOpen={!!debt} onClose={onClose} title="Detalle de Deuda">
            <div className="space-y-4">
                {/* Info card */}
                <div className={`rounded-2xl p-4 border ${isPaid ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/30'}`}>
                    <p className="text-sm font-black text-slate-800 dark:text-white mb-2">{debt.concept}</p>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Monto original</p>
                            <p className="text-lg font-black text-slate-700 dark:text-slate-200">${amountUsd.toFixed(2)}</p>
                            {amountBs && <p className="text-[10px] text-slate-400 font-bold">Bs {amountBs}</p>}
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Pendiente</p>
                            <p className={`text-lg font-black ${isPaid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isPaid ? 'PAGADA' : `$${remainingUsd.toFixed(2)}`}
                            </p>
                            {!isPaid && remainingBs && <p className="text-[10px] text-slate-400 font-bold">Bs {remainingBs}</p>}
                        </div>
                    </div>

                    {/* Progress bar */}
                    {!isPaid && (
                        <div className="mt-3">
                            <div className="flex justify-between mb-1">
                                <span className="text-[9px] text-slate-400 font-bold">Progreso de pago</span>
                                <span className="text-[9px] text-slate-400 font-bold">{progressPct.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>
                    )}

                    <p className="text-[10px] text-slate-400 mt-2">
                        {new Date(debt.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>

                {/* Historial */}
                <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                        <Clock size={10} /> Historial de Abonos ({debtPayments.length})
                    </p>
                    {debtPayments.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">Sin abonos registrados</p>
                    ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {debtPayments.map(p => {
                                const pBs = fmtBs(Number(p.amount_usd), effectiveRate);
                                return (
                                    <div key={p.id} className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5">
                                        <div>
                                            <p className="text-xs font-bold text-emerald-600">+${Number(p.amount_usd).toFixed(2)}</p>
                                            {pBs && <p className="text-[9px] text-slate-400 font-medium">Bs {pBs}</p>}
                                            {p.note && <p className="text-[10px] text-slate-400 mt-0.5">{p.note}</p>}
                                        </div>
                                        <p className="text-[10px] text-slate-400">
                                            {new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Payment form */}
                {!isPaid && (
                    showPayForm ? (
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] uppercase font-bold text-emerald-600">Registrar Abono</p>

                            {/* Currency toggle for payment */}
                            <div className="flex bg-white dark:bg-slate-800 rounded-xl p-0.5">
                                <button onClick={() => { setPayCurrency('USD'); setPayAmount(''); }}
                                    className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                                        payCurrency === 'USD'
                                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 shadow-sm'
                                            : 'text-slate-400'
                                    }`}>
                                    $ USD
                                </button>
                                <button onClick={() => { setPayCurrency('BS'); setPayAmount(''); }}
                                    className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                                        payCurrency === 'BS'
                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 shadow-sm'
                                            : 'text-slate-400'
                                    }`}>
                                    Bs
                                </button>
                            </div>

                            <div className="relative">
                                {payCurrency === 'USD'
                                    ? <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                                    : <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 font-black text-xs">Bs</span>
                                }
                                <input type="number" step="0.01" min="0"
                                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                    placeholder={payCurrency === 'USD'
                                        ? `Máx: $${remainingUsd.toFixed(2)}`
                                        : `Máx: Bs ${remainingBs || '...'}`
                                    }
                                    className="w-full bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            </div>

                            {/* Pay conversion preview */}
                            {payRaw > 0 && effectiveRate > 0 && (
                                <p className="text-[10px] text-slate-400 text-center">
                                    {payCurrency === 'BS'
                                        ? <>≈ <span className="font-bold text-emerald-600">${payUsdPreview.toFixed(2)} USD</span></>
                                        : <>≈ <span className="font-bold text-blue-600">Bs {payBsPreview.toFixed(2)}</span></>
                                    }
                                </p>
                            )}

                            <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                                placeholder="Nota (opcional)"
                                className="w-full bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            <div className="flex gap-2">
                                <button onClick={() => setShowPayForm(false)}
                                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl">
                                    Cancelar
                                </button>
                                <button onClick={handlePay}
                                    disabled={saving || !payValid}
                                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all">
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                    {saving ? 'Guardando...' : 'Abonar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => { setShowPayForm(true); setPayAmount(''); setPayNote(''); setPayCurrency('USD'); }}
                            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2">
                            <CreditCard size={16} /> Registrar Abono
                        </button>
                    )
                )}

                {/* Delete */}
                <button onClick={handleDelete}
                    className="w-full py-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5">
                    <Trash2 size={13} /> Eliminar deuda
                </button>
            </div>
        </Modal>
    );
}
