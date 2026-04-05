import { useState } from 'react';
import { Users, ChevronDown, UserPlus, Check, Wallet } from 'lucide-react';
import { formatBs } from '../../utils/calculatorUtils';

export default function CustomerPickerSection({
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    effectiveRate,
    remainingUsd,
    onUseSaldoFavor,
    triggerHaptic,
    onCreateCustomer,
    EPSILON,
}) {
    const [showCustomerPicker, setShowCustomerPicker] = useState(false);
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientDocument, setNewClientDocument] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [savingClient, setSavingClient] = useState(false);

    const handleCreateClient = async () => {
        if (!newClientName.trim() || !onCreateCustomer) return;
        setSavingClient(true);
        try {
            const newCustomer = await onCreateCustomer(newClientName.trim(), newClientDocument.trim(), newClientPhone.trim());
            setSelectedCustomerId(newCustomer.id);
            setNewClientName('');
            setNewClientDocument('');
            setNewClientPhone('');
            setShowNewCustomerForm(false);
            setShowCustomerPicker(false);
        } finally {
            setSavingClient(false);
        }
    };

    const handleSaldoFavor = () => {
        triggerHaptic && triggerHaptic();
        if (onUseSaldoFavor) onUseSaldoFavor();
    };

    return (
        <div className="px-3 py-2">
            <button
                onClick={() => setShowCustomerPicker(!showCustomerPicker)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        {selectedCustomer ? selectedCustomer.name : 'Consumidor Final'}
                    </span>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${showCustomerPicker ? 'rotate-180' : ''}`} />
            </button>

            {showCustomerPicker && (
                <div className="mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-lg max-h-40 overflow-y-auto">
                    <button
                        onClick={() => { setSelectedCustomerId(''); setShowCustomerPicker(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${!selectedCustomerId ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        Consumidor Final
                    </button>

                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    {!showNewCustomerForm ? (
                        <button
                            onClick={() => setShowNewCustomerForm(true)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        >
                            <UserPlus size={14} />
                            Nuevo cliente...
                        </button>
                    ) : (
                        <div className="p-4 space-y-3 bg-slate-50 dark:bg-slate-900/50 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="space-y-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 p-3 bg-emerald-50/50 dark:bg-emerald-900/10">
                                <div>
                                    <label className="block text-[10px] font-bold text-emerald-700 dark:text-emerald-500 uppercase mb-1">Nombre del cliente *</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Ej: Juan Pérez"
                                        value={newClientName}
                                        onChange={e => setNewClientName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleCreateClient()}
                                        className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Cédula / RIF (Opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: V-12345678"
                                        value={newClientDocument}
                                        onChange={e => setNewClientDocument(e.target.value.toUpperCase())}
                                        onKeyDown={e => e.key === 'Enter' && handleCreateClient()}
                                        className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Teléfono (Opcional)</label>
                                    <div className="w-full flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500/50 transition-all overflow-hidden">
                                        <span className="px-3 py-2.5 text-xs font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0 select-none">+58</span>
                                        <input
                                            type="tel"
                                            placeholder="0412 1234567"
                                            value={newClientPhone}
                                            onChange={e => {
                                                const clean = e.target.value.replace(/^\+?58/, '');
                                                setNewClientPhone(clean);
                                            }}
                                            onKeyDown={e => e.key === 'Enter' && handleCreateClient()}
                                            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-700 dark:text-white outline-none placeholder:text-slate-400 font-medium"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => { setShowNewCustomerForm(false); setNewClientName(''); setNewClientDocument(''); setNewClientPhone(''); }}
                                    className="flex-1 py-2 text-sm font-bold text-slate-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateClient}
                                    disabled={!newClientName.trim() || savingClient}
                                    className="flex-1 py-2 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Check size={16} />
                                    {savingClient ? 'Guardando...' : 'Crear y Usar'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    {customers.map(c => (
                        <button
                            key={c.id}
                            onClick={() => { setSelectedCustomerId(c.id); setShowCustomerPicker(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium border-t border-slate-100 dark:border-slate-800 transition-colors ${selectedCustomerId === c.id ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                            {c.name}
                            {c.deuda !== 0 && (
                                <span className={`ml-2 text-xs font-bold ${c.deuda > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {c.deuda > 0 ? `Debe $${c.deuda.toFixed(2)}` : `Favor $${Math.abs(c.deuda).toFixed(2)}`}
                                    {effectiveRate > 0 && ` (${formatBs(Math.abs(c.deuda) * effectiveRate)} Bs)`}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Saldo a Favor */}
            {selectedCustomer?.deuda < -EPSILON && remainingUsd >= EPSILON && (
                <div className="mt-2">
                    <button
                        onClick={handleSaldoFavor}
                        className="w-full py-2.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        <Wallet size={16} /> Usar Saldo a Favor (${Math.abs(selectedCustomer.deuda).toFixed(2)})
                    </button>
                </div>
            )}
        </div>
    );
}
