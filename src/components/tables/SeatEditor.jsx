import React, { useState } from 'react';
import { Plus, X, Clock, Target, Timer, ShoppingBag, ChevronDown, ChevronUp, UserCheck, Users } from 'lucide-react';

const GAME_MODES = [
    { value: 'HOURS', label: 'Hora', icon: Clock, color: 'sky' },
    { value: 'PINA', label: 'Piña', icon: Target, color: 'amber' },
    { value: 'LIBRE', label: 'Libre', icon: Timer, color: 'emerald' },
    { value: 'NONE', label: 'Solo Consumo', icon: ShoppingBag, color: 'slate' },
];

const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 3];

function SeatRow({ seat, index, onUpdate, onRemove, isPoolTable }) {
    const [expanded, setExpanded] = useState(true);
    const modes = isPoolTable ? GAME_MODES : GAME_MODES.filter(m => m.value === 'NONE');

    return (
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-[10px] font-black shrink-0">
                    {index + 1}
                </div>
                <input
                    type="text"
                    placeholder={`Persona ${index + 1}`}
                    value={seat.label}
                    onChange={e => onUpdate({ ...seat, label: e.target.value })}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none min-w-0"
                />
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                    onClick={onRemove}
                    className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Expanded config */}
            {expanded && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-slate-200 dark:border-slate-700 pt-2.5">
                    {/* Game mode pills */}
                    <div>
                        <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Modo</label>
                        <div className="flex flex-wrap gap-1.5">
                            {modes.map(mode => {
                                const Icon = mode.icon;
                                const isActive = seat.gameMode === mode.value;
                                const colorMap = {
                                    sky: isActive ? 'bg-sky-500 text-white shadow-sky-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-sky-100 dark:hover:bg-sky-900/20',
                                    amber: isActive ? 'bg-amber-500 text-white shadow-amber-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-amber-100 dark:hover:bg-amber-900/20',
                                    emerald: isActive ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/20',
                                    slate: isActive ? 'bg-slate-600 text-white shadow-slate-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
                                };
                                return (
                                    <button
                                        key={mode.value}
                                        onClick={() => onUpdate({ ...seat, gameMode: mode.value, hoursPaid: mode.value === 'HOURS' ? (seat.hoursPaid || 1) : 0, pinas: mode.value === 'PINA' ? (seat.pinas || 1) : 0 })}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${isActive ? 'shadow-md' : ''} ${colorMap[mode.color]}`}
                                    >
                                        <Icon size={12} />
                                        {mode.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Hours selector */}
                    {seat.gameMode === 'HOURS' && (
                        <div>
                            <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Horas</label>
                            <div className="flex flex-wrap gap-1.5">
                                {HOUR_OPTIONS.map(h => (
                                    <button
                                        key={h}
                                        onClick={() => onUpdate({ ...seat, hoursPaid: h })}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            seat.hoursPaid === h
                                                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-sky-100 dark:hover:bg-sky-900/20'
                                        }`}
                                    >
                                        {h === 0.5 ? '½h' : `${h}h`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pinas selector */}
                    {seat.gameMode === 'PINA' && (
                        <div>
                            <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Piñas</label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onUpdate({ ...seat, pinas: Math.max(1, (seat.pinas || 1) - 1) })}
                                    className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center"
                                >−</button>
                                <span className="text-sm font-black text-amber-600 dark:text-amber-400 w-6 text-center">{seat.pinas || 1}</span>
                                <button
                                    onClick={() => onUpdate({ ...seat, pinas: (seat.pinas || 1) + 1 })}
                                    className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center"
                                >+</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function generateSeatId() {
    return 'seat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export function SeatEditor({ seats, onSeatsChange, isPoolTable = true }) {
    const addSeat = () => {
        const newSeat = {
            id: generateSeatId(),
            label: '',
            customerId: null,
            gameMode: isPoolTable ? 'HOURS' : 'NONE',
            hoursPaid: isPoolTable ? 1 : 0,
            pinas: 0,
            paid: false,
        };
        onSeatsChange([...seats, newSeat]);
    };

    const updateSeat = (index, updated) => {
        const next = [...seats];
        next[index] = updated;
        onSeatsChange(next);
    };

    const removeSeat = (index) => {
        onSeatsChange(seats.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1">
                    <Users size={10} /> Personas ({seats.length})
                </label>
            </div>

            {seats.length > 0 && (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-0.5">
                    {seats.map((seat, i) => (
                        <SeatRow
                            key={seat.id}
                            seat={seat}
                            index={i}
                            onUpdate={(updated) => updateSeat(i, updated)}
                            onRemove={() => removeSeat(i)}
                            isPoolTable={isPoolTable}
                        />
                    ))}
                </div>
            )}

            <button
                onClick={addSeat}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:border-sky-400 hover:text-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-all text-xs font-bold"
            >
                <Plus size={14} />
                Agregar Persona
            </button>
        </div>
    );
}
