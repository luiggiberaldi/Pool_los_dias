import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { useDebtsStore } from '../../hooks/store/useDebtsStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { showToast } from '../Toast';
import { DollarSign, Plus, Clock, CheckCircle, Trash2, CreditCard } from 'lucide-react';

// ── Modal: Agregar Deuda ──────────────────────────────────────
export function AddDebtModal({ isOpen, onClose }) {
    const { cachedUsers } = useAuthStore();
    const { createDebt } = useDebtsStore();
    const [staffId, setStaffId] = useState('');
    const [concept, setConcept] = useState('');
    const [amount, setAmount] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) { setStaffId(''); setConcept(''); setAmount(''); }
    }, [isOpen]);

    const activeUsers = cachedUsers.filter(u => u.active !== false);
    const canSubmit = staffId && concept.trim() && Number(amount) > 0 && !saving;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        try {
            await createDebt(staffId, concept, Number(amount));
            showToast('Deuda registrada', 'success');
            onClose();
        } catch (err) {
            console.error(err);
            showToast('Error al registrar deuda', 'error');
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Deuda">
            <div className="space-y-4">
                {/* Empleado */}
                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Empleado</label>
                    <select value={staffId} onChange={e => setStaffId(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30">
                        <option value="">Seleccionar...</option>
                        {activeUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                    </select>
                </div>

                {/* Concepto */}
                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Concepto</label>
                    <input type="text" value={concept} onChange={e => setConcept(e.target.value)}
                        placeholder="Ej: 4x Zulia, 2 horas mesa 3..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30" />
                </div>

                {/* Monto */}
                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Monto (USD)</label>
                    <div className="relative">
                        <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30" />
                    </div>
                </div>

                {/* Submit */}
                <button onClick={handleSubmit} disabled={!canSubmit}
                    className="w-full py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-300 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-md shadow-rose-500/20 disabled:shadow-none flex items-center justify-center gap-2">
                    <Plus size={16} /> Registrar Deuda
                </button>
            </div>
        </Modal>
    );
}

// ── Modal: Detalle de Deuda + Historial ───────────────────────
export function DebtDetailModal({ debt, onClose }) {
    const { fetchPayments, payments, addPayment, deleteDebt } = useDebtsStore();
    const [showPayForm, setShowPayForm] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (debt) {
            fetchPayments(debt.id);
            setShowPayForm(false);
            setPayAmount('');
            setPayNote('');
        }
    }, [debt?.id]);

    if (!debt) return null;

    const debtPayments = payments[debt.id] || [];
    const isPaid = debt.status === 'paid';

    const handlePay = async () => {
        const amt = Number(payAmount);
        if (amt <= 0 || amt > debt.remaining_usd) return;
        setSaving(true);
        try {
            await addPayment(debt.id, amt, payNote);
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

    return (
        <Modal isOpen={!!debt} onClose={onClose} title="Detalle de Deuda">
            <div className="space-y-4">
                {/* Info */}
                <div className={`rounded-2xl p-4 border ${isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <p className="text-sm font-black text-slate-800 mb-1">{debt.concept}</p>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Monto original</p>
                            <p className="text-lg font-black text-slate-700">${Number(debt.amount_usd).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Pendiente</p>
                            <p className={`text-lg font-black ${isPaid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isPaid ? 'PAGADA' : `$${Number(debt.remaining_usd).toFixed(2)}`}
                            </p>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                        {new Date(debt.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>

                {/* Historial de abonos */}
                <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                        <Clock size={10} /> Historial de Abonos ({debtPayments.length})
                    </p>
                    {debtPayments.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">Sin abonos registrados</p>
                    ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {debtPayments.map(p => (
                                <div key={p.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2">
                                    <div>
                                        <p className="text-xs font-bold text-emerald-600">+${Number(p.amount_usd).toFixed(2)}</p>
                                        {p.note && <p className="text-[10px] text-slate-400">{p.note}</p>}
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                        {new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Formulario de abono */}
                {!isPaid && (
                    showPayForm ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
                            <p className="text-[10px] uppercase font-bold text-emerald-600">Registrar Abono</p>
                            <div className="relative">
                                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="number" step="0.01" min="0" max={debt.remaining_usd}
                                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                                    placeholder={`Máx: $${Number(debt.remaining_usd).toFixed(2)}`}
                                    className="w-full bg-white border border-emerald-200 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            </div>
                            <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                                placeholder="Nota (opcional)"
                                className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            <div className="flex gap-2">
                                <button onClick={() => setShowPayForm(false)}
                                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold text-xs rounded-xl">
                                    Cancelar
                                </button>
                                <button onClick={handlePay}
                                    disabled={saving || Number(payAmount) <= 0 || Number(payAmount) > debt.remaining_usd}
                                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5">
                                    <CheckCircle size={14} /> Abonar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => { setShowPayForm(true); setPayAmount(''); setPayNote(''); }}
                            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2">
                            <CreditCard size={16} /> Registrar Abono
                        </button>
                    )
                )}

                {/* Eliminar */}
                <button onClick={handleDelete}
                    className="w-full py-2.5 text-rose-500 hover:bg-rose-50 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5">
                    <Trash2 size={13} /> Eliminar deuda
                </button>
            </div>
        </Modal>
    );
}
