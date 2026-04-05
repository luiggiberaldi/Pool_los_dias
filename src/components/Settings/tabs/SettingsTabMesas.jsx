import React, { useState, useEffect } from 'react';
import { Layers, Check, Plus, Trash2, Edit2, X, DollarSign, AlertTriangle } from 'lucide-react';
import { SectionCard } from '../../SettingsShared';
import { useTablesStore } from '../../../hooks/store/useTablesStore';
import ConfirmModal from '../../ConfirmModal';

function useBcvRate() {
    const [rate, setRate] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
            if (saved?.bcv?.price) return saved.bcv.price;
        } catch { /* ignore parse errors */ }
        return 1;
    });
    useEffect(() => {
        const handleStorage = () => {
             try {
                const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
                if (saved?.bcv?.price) setRate(saved.bcv.price);
            } catch { /* ignore parse errors */ }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);
    return rate;
}

export default function SettingsTabMesas({ showToast, triggerHaptic }) {
    const { config, updateConfig, tables, addTable, updateTable, deleteTable } = useTablesStore();
    const bcvRate = useBcvRate();
    
    // Config State — synced from store config
    const [pricePerHour, setPricePerHour] = useState(config?.pricePerHour || 0);
    const [pricePina, setPricePina] = useState(config?.pricePina || 0);

    // Sync local state when external config changes (e.g., from another tab/device)
    const configPricePerHour = config?.pricePerHour;
    const configPricePina = config?.pricePina;
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            if (configPricePerHour != null) setPricePerHour(configPricePerHour);
            if (configPricePina != null) setPricePina(configPricePina);
        });
        return () => cancelAnimationFrame(raf);
    }, [configPricePerHour, configPricePina]);

    // Form State for new/edit table
    const [isEditing, setIsEditing] = useState(null);
    const [tableName, setTableName] = useState(() => {
        let maxNum = 0;
        const currentTables = useTablesStore.getState().tables;
        currentTables.forEach(t => {
            const match = t.name.match(/\d+/);
            if (match) {
                const num = parseInt(match[0], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `Mesa ${maxNum + 1}`;
    });
    const [tableType, setTableType] = useState('POOL');
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    const getNextTableName = () => {
        let maxNum = 0;
        const currentTables = useTablesStore.getState().tables;
        currentTables.forEach(t => {
            const match = t.name.match(/\d+/);
            if (match) {
                const num = parseInt(match[0], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `Mesa ${maxNum + 1}`;
    };

    // Auto-fill next table name when tables change and we're not editing
    const tablesLength = tables.length;
    useEffect(() => {
        if (!isEditing) {
            const raf = requestAnimationFrame(() => {
                setTableName(getNextTableName());
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [tablesLength]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveConfig = async () => {
        await updateConfig({
            pricePerHour: parseFloat(pricePerHour) || 0,
            pricePina: parseFloat(pricePina) || 0
        });
        showToast('Tarifas guardadas', 'success');
        triggerHaptic?.('light');
    };

    const handleAddOrUpdateTable = async () => {
        if (!tableName.trim()) return;
        setIsSaving(true);
        try {
            if (isEditing) {
                await updateTable(isEditing, { name: tableName, type: tableType });
                showToast('Mesa actualizada correctamente', 'success');
            } else {
                await addTable(tableName, tableType);
                showToast('Mesa agregada exitosamente', 'success');
            }
            // Reset
            setIsEditing(null);
            setTableName(getNextTableName()); // Now safely uses fresh state!
            setTableType('POOL');
        } catch (e) {
            showToast('Error al guardar tabla', 'error');
        } finally {
            setIsSaving(false);
            triggerHaptic?.('light');
        }
    };

    const handleEditSetup = (t) => {
        setIsEditing(t.id);
        setTableName(t.name);
        setTableType(t.type || 'POOL');
    };

    const handleDelete = async () => {
        if (!deleteTargetId) return;
        const { activeSessions } = useTablesStore.getState();
        if (activeSessions.some(s => s.table_id === deleteTargetId)) {
            showToast('No puedes borrar una mesa que está abierta', 'error');
            setDeleteTargetId(null);
            return;
        }
        try {
            await deleteTable(deleteTargetId);
            showToast('Mesa eliminada', 'success');
            triggerHaptic?.('light');
        } catch (e) {
            showToast('Error al eliminar mesa', 'error');
        } finally {
            setDeleteTargetId(null);
        }
    };


    return (
        <div className="space-y-6">
            {/* Tarifas */}
            <SectionCard icon={DollarSign} title="Tarifas de Juego" subtitle="Aplica globalmente para Mesas de Pool" iconColor="text-emerald-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 flex justify-between items-center">
                            <span>Hora Libre (USD)</span>
                            <span className="text-emerald-500/80 lowercase">~ bs {(pricePerHour * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</span>
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-bold text-slate-400">$</span>
                            <input
                                type="number"
                                value={pricePerHour}
                                onChange={e => setPricePerHour(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all dark:text-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 flex justify-between items-center">
                            <span>La Piña (USD)</span>
                            <span className="text-emerald-500/80 lowercase">~ bs {(pricePina * bcvRate).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</span>
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-bold text-slate-400">$</span>
                            <input
                                type="number"
                                value={pricePina}
                                onChange={e => setPricePina(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all dark:text-white"
                            />
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleSaveConfig}
                    className="w-full flex items-center justify-center gap-2 py-3 mt-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-emerald-100 transition-colors active:scale-[0.98]"
                >
                    <Check size={16} /> Guardar Tarifas
                </button>
            </SectionCard>

            {/* Administracion de Mesas */}
            <SectionCard icon={Layers} title="Infraestructura de Mesas" subtitle="Crea y gestiona las áreas del bar" iconColor="text-sky-500">
                {/* Form */}
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        {isEditing ? 'Editar Mesa' : 'Añadir Nueva Mesa'}
                    </h4>
                    <div className="flex flex-col gap-3">
                        {/* Row 1: Nombre */}
                        <input
                            type="text"
                            placeholder="Nombre (ej. Mesa VIP)"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-medium dark:text-white focus:ring-2 focus:ring-sky-500/30 outline-none"
                        />
                        {/* Row 2: Tipo + Acción */}
                        <div className="flex gap-2">
                            {/* Toggle buttons instead of select to avoid overflow */}
                            <div className="flex flex-1 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setTableType('POOL')}
                                    className={`flex-1 text-xs font-bold py-2 px-2 transition-colors truncate ${tableType === 'POOL' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                >
                                    Pool (Tiempo)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTableType('NORMAL')}
                                    className={`flex-1 text-xs font-bold py-2 px-2 transition-colors truncate border-l border-slate-300 dark:border-slate-700 ${tableType === 'NORMAL' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                >
                                    Normal (Bar)
                                </button>
                            </div>
                            <button 
                                onClick={handleAddOrUpdateTable}
                                disabled={!tableName.trim() || isSaving}
                                className="shrink-0 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                {isEditing ? <Check size={15} /> : <Plus size={15} />}
                                {isEditing ? 'Guardar' : 'Agregar'}
                            </button>
                            {isEditing && (
                                <button 
                                    onClick={() => { setIsEditing(null); setTableName(''); setTableType('POOL'); }}
                                    className="shrink-0 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg transition-colors"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* List */}
                <div className="space-y-2">
                    {tables.map(table => (
                        <div key={table.id} className="flex items-center justify-between p-3 border border-slate-100 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <div>
                                <h5 className="font-bold text-slate-800 dark:text-white text-sm">{table.name}</h5>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mt-1 ${
                                    table.type === 'NORMAL' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                                }`}>
                                    {table.type === 'NORMAL' ? 'MESA NORMAL' : 'MESA POOL'}
                                </span>
                            </div>
                            <div className="flex gap-2 items-center">
                                <button onClick={() => handleEditSetup(table)} className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-all">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => setDeleteTargetId(table.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {tables.length === 0 && (
                        <p className="text-center text-sm text-slate-400 py-4">No hay mesas configuradas.</p>
                    )}
                </div>
            </SectionCard>

            <ConfirmModal
                isOpen={!!deleteTargetId}
                onClose={() => setDeleteTargetId(null)}
                onConfirm={handleDelete}
                variant="danger"
                title="Eliminar Mesa"
                message={`Esta accion eliminara la mesa permanentemente.\nLas sesiones previas se mantendran en el historial.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
            />
        </div>
    );
}
