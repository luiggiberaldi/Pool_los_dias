import React, { useEffect, useState, useMemo } from 'react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useAuthStore } from '../hooks/store/authStore';
import TableCard from '../components/tables/TableCard';
import { Layers, PauseCircle, PlayCircle } from 'lucide-react';
import { calculateElapsedTime } from '../utils/tableBillingEngine';
import { showToast } from '../components/Toast';

const TYPE_FILTERS   = ['Todas', 'Pool', 'Bar'];
const STATUS_FILTERS = ['Todas', 'Libres', 'Ocupadas'];

function FilterPill({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 border ${
                active
                    ? 'bg-sky-500 text-white border-sky-500 shadow-sm shadow-sky-500/30'
                    : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300'
            }`}
        >
            {label}
        </button>
    );
}

export default function TablesView({ triggerHaptic: _triggerHaptic, isActive }) {
    const { tables, activeSessions, loading, syncTablesAndSessions } = useTablesStore();
    const { role, currentUser } = useAuthStore();
    const isAdmin = role === 'ADMIN';

    const [typeFilter,   setTypeFilter]   = useState('Todas');
    const [statusFilter, setStatusFilter] = useState('Todas');
    const [ownerFilter, setOwnerFilter]   = useState('Todas');

    const isMesero = role === 'MESERO';

    // Detectar si hay alguna sesión pausada (para el botón global)
    const pausableSessions = useMemo(() =>
        activeSessions.filter(s => s.game_mode !== 'PINA'),
        [activeSessions]
    );
    const [anyPaused, setAnyPaused] = useState(false);

    // Verificar estado de pausa al montar y cuando cambian sesiones
    useEffect(() => {
        const checkPauses = () => {
            const hasPaused = pausableSessions.some(s => {
                try {
                    const data = JSON.parse(localStorage.getItem(`table_pause_${s.id}`));
                    return data?.isPaused === true;
                } catch { return false; }
            });
            setAnyPaused(hasPaused);
        };
        checkPauses();
        // Escuchar cambios de pausa desde las TableCards individuales
        window.addEventListener('storage', checkPauses);
        const interval = setInterval(checkPauses, 1000);
        return () => {
            window.removeEventListener('storage', checkPauses);
            clearInterval(interval);
        };
    }, [pausableSessions]);

    const handlePauseAll = () => {
        let count = 0;
        pausableSessions.forEach(s => {
            const key = `table_pause_${s.id}`;
            try {
                const existing = JSON.parse(localStorage.getItem(key));
                if (existing?.isPaused) return; // ya pausada
            } catch {}
            const currentElapsed = calculateElapsedTime(s.started_at);
            localStorage.setItem(key, JSON.stringify({ isPaused: true, elapsedAtPause: currentElapsed }));
            count++;
        });
        setAnyPaused(true);
        // Forzar re-render de las TableCards
        window.dispatchEvent(new StorageEvent('storage', { key: 'global_pause_trigger' }));
        showToast(`${count} mesa${count !== 1 ? 's' : ''} pausada${count !== 1 ? 's' : ''}`, 'success');
    };

    const handleResumeAll = () => {
        let count = 0;
        pausableSessions.forEach(s => {
            const key = `table_pause_${s.id}`;
            try {
                const saved = JSON.parse(localStorage.getItem(key));
                if (!saved?.isPaused) return;
                // Compensar tiempo de pausa ajustando started_at
                const currentElapsed = calculateElapsedTime(s.started_at);
                const pausedMinutes = currentElapsed - saved.elapsedAtPause;
                const newStartedAt = new Date(new Date(s.started_at).getTime() + pausedMinutes * 60000).toISOString();
                // Actualizar sesión en store
                useTablesStore.getState().updateSessionTime(s.id, newStartedAt);
            } catch {}
            localStorage.removeItem(key);
            count++;
        });
        setAnyPaused(false);
        window.dispatchEvent(new StorageEvent('storage', { key: 'global_pause_trigger' }));
        showToast(`${count} mesa${count !== 1 ? 's' : ''} reanudada${count !== 1 ? 's' : ''}`, 'success');
    };

    useEffect(() => {
        if (isActive) {
            syncTablesAndSessions();
        }
    }, [isActive, syncTablesAndSessions]);

    const filteredTables = useMemo(() => {
        const filtered = tables.filter(table => {
            const session    = activeSessions.find(s => s.table_id === table.id);
            const isOccupied = !!session;

            if (typeFilter === 'Pool' && table.type !== 'POOL')   return false;
            if (typeFilter === 'Bar'  && table.type !== 'NORMAL') return false;

            if (statusFilter === 'Libres'   &&  isOccupied) return false;
            if (statusFilter === 'Ocupadas' && !isOccupied) return false;

            if (ownerFilter === 'Mis Mesas' && (!isOccupied || session.opened_by !== currentUser?.id)) return false;

            return true;
        });

        // Meseros: sus mesas primero, luego el resto
        if (isMesero && currentUser?.id) {
            filtered.sort((a, b) => {
                const sA = activeSessions.find(s => s.table_id === a.id);
                const sB = activeSessions.find(s => s.table_id === b.id);
                const aMine = sA?.opened_by === currentUser.id ? 1 : 0;
                const bMine = sB?.opened_by === currentUser.id ? 1 : 0;
                return bMine - aMine;
            });
        }

        return filtered;
    }, [tables, activeSessions, typeFilter, statusFilter, ownerFilter, currentUser, isMesero]);

    if (loading) {
        return (
            <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto w-full">
                <div className="h-20 w-1/3 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4].map(k => (
                        <div key={k} className="h-64 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-3xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar w-full relative">

            {/* ── STICKY HEADER + FILTERS ── */}
            <div className="sticky top-0 z-20 bg-[#F8FAFC]/90 dark:bg-[#0f172a]/90 backdrop-blur-xl px-6 pt-4 pb-3 border-b border-slate-200/50 dark:border-white/5">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
                            <Layers className="text-sky-500" />
                            Mesas de Pool
                        </h2>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">
                            {filteredTables.length} mesa{filteredTables.length !== 1 ? 's' : ''} mostrada{filteredTables.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    {/* Botón pausa general de emergencia — solo admin, solo si hay sesiones activas */}
                    {isAdmin && pausableSessions.length > 0 && (
                        <button
                            onClick={anyPaused ? handleResumeAll : handlePauseAll}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all active:scale-95 shadow-sm ${
                                anyPaused
                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                                    : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                            }`}
                        >
                            {anyPaused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                            {anyPaused ? 'Reanudar Todas' : 'Pausar Todas'}
                        </button>
                    )}
                </div>

                {/* Filter rows */}
                <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-10">Tipo</span>
                        {TYPE_FILTERS.map(f => (
                            <FilterPill key={f} label={f} active={typeFilter === f} onClick={() => setTypeFilter(f)} />
                        ))}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-10">Est.</span>
                        {STATUS_FILTERS.map(f => (
                            <FilterPill key={f} label={f} active={statusFilter === f} onClick={() => setStatusFilter(f)} />
                        ))}
                    </div>
                    {isMesero && (
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-10">Mías</span>
                        {['Todas', 'Mis Mesas'].map(f => (
                            <FilterPill key={f} label={f} active={ownerFilter === f} onClick={() => setOwnerFilter(f)} />
                        ))}
                    </div>
                    )}
                </div>
            </div>

            {/* ── TABLE GRID ── */}
            <div className="p-6">
                {tables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <Layers size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No hay mesas configuradas</h3>
                        <p className="text-slate-500 mt-2 text-sm max-w-sm">Contacte al administrador para registrar las mesas del negocio en la base de datos.</p>
                    </div>
                ) : filteredTables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <Layers size={40} className="text-slate-300 dark:text-slate-700 mb-3" />
                        <h3 className="text-base font-bold text-slate-600 dark:text-slate-400">Sin resultados</h3>
                        <p className="text-slate-400 mt-1 text-sm">Prueba cambiando los filtros.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                        {filteredTables.map(table => {
                            const session = activeSessions.find(s => s.table_id === table.id);
                            return (
                                <TableCard key={table.id} table={table} session={session} />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
