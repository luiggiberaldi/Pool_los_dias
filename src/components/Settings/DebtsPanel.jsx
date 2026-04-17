import React, { useState, useEffect } from 'react';
import { useDebtsStore } from '../../hooks/store/useDebtsStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { AddDebtModal, DebtDetailModal } from './DebtModals';
import { Plus, Receipt, ChevronDown, ChevronRight, DollarSign, User, Filter } from 'lucide-react';

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

export default function DebtsPanel() {
    const { debts, loading, fetchDebts } = useDebtsStore();
    const { cachedUsers } = useAuthStore();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [expandedStaff, setExpandedStaff] = useState(null);
    const [filter, setFilter] = useState('pending'); // 'all' | 'pending' | 'paid'

    useEffect(() => { fetchDebts(); }, []);

    // Agrupar deudas por empleado
    const filteredDebts = filter === 'all' ? debts
        : debts.filter(d => d.status === filter);

    const staffMap = {};
    filteredDebts.forEach(d => {
        if (!staffMap[d.staff_id]) {
            const user = cachedUsers.find(u => u.id === d.staff_id);
            staffMap[d.staff_id] = {
                id: d.staff_id,
                name: user ? capitalize(user.name) : 'Desconocido',
                role: user?.role || '?',
                debts: [],
                totalPending: 0,
            };
        }
        staffMap[d.staff_id].debts.push(d);
        if (d.status === 'pending') {
            staffMap[d.staff_id].totalPending += Number(d.remaining_usd);
        }
    });

    const staffList = Object.values(staffMap).sort((a, b) => b.totalPending - a.totalPending);

    const toggleExpand = (id) => {
        setExpandedStaff(expandedStaff === id ? null : id);
    };

    const totalGlobal = debts.filter(d => d.status === 'pending').reduce((s, d) => s + Number(d.remaining_usd), 0);
    const pendingCount = debts.filter(d => d.status === 'pending').length;

    return (
        <div className="space-y-4">
            {/* Header con resumen */}
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-4 text-white shadow-lg shadow-rose-500/20">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Receipt size={18} />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Deudas de Empleados</p>
                    </div>
                    <button onClick={() => setShowAddModal(true)}
                        className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all active:scale-90">
                        <Plus size={18} />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/15 rounded-xl p-3">
                        <p className="text-[10px] text-white/60 font-bold uppercase mb-0.5">Total pendiente</p>
                        <p className="text-2xl font-black">${totalGlobal.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/15 rounded-xl p-3">
                        <p className="text-[10px] text-white/60 font-bold uppercase mb-0.5">Deudas activas</p>
                        <p className="text-2xl font-black">{pendingCount}</p>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                {[
                    { id: 'pending', label: 'Pendientes' },
                    { id: 'paid', label: 'Pagadas' },
                    { id: 'all', label: 'Todas' },
                ].map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                        className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${filter === f.id
                            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Lista por empleado */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : staffList.length === 0 ? (
                <div className="text-center py-12">
                    <Receipt size={32} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-sm text-slate-400 font-medium">
                        {filter === 'pending' ? 'No hay deudas pendientes' : filter === 'paid' ? 'No hay deudas pagadas' : 'No hay deudas registradas'}
                    </p>
                    <button onClick={() => setShowAddModal(true)}
                        className="mt-3 text-xs text-rose-500 font-bold hover:underline">
                        + Registrar primera deuda
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {staffList.map(staff => {
                        const isOpen = expandedStaff === staff.id;
                        return (
                            <div key={staff.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                                {/* Empleado header */}
                                <button onClick={() => toggleExpand(staff.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                                            <User size={16} className="text-rose-500" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-black text-slate-800 dark:text-white">{staff.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">{staff.debts.length} {staff.debts.length === 1 ? 'deuda' : 'deudas'} · {staff.role}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {staff.totalPending > 0 && (
                                            <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                                                ${staff.totalPending.toFixed(2)}
                                            </span>
                                        )}
                                        {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                    </div>
                                </button>

                                {/* Deudas del empleado */}
                                {isOpen && (
                                    <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-2 space-y-1.5">
                                        {staff.debts.map(d => (
                                            <button key={d.id} onClick={() => setSelectedDebt(d)}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98] ${
                                                    d.status === 'paid'
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100'
                                                        : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700'
                                                }`}>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{d.concept}</p>
                                                    <p className="text-[10px] text-slate-400">
                                                        {new Date(d.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                                        {' · '}Original: ${Number(d.amount_usd).toFixed(2)}
                                                    </p>
                                                </div>
                                                <span className={`text-xs font-black ml-2 shrink-0 ${d.status === 'paid' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {d.status === 'paid' ? 'PAGADA' : `$${Number(d.remaining_usd).toFixed(2)}`}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            <AddDebtModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <DebtDetailModal debt={selectedDebt} onClose={() => setSelectedDebt(null)} />
        </div>
    );
}
