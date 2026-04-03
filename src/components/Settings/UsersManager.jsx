import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { showToast } from '../Toast';
import {
    UserPlus, Trash2, KeyRound, Shield, ShoppingCart,
    Crown, X, Check, Eye, EyeOff, AlertTriangle, Edit2
} from 'lucide-react';

const ROLE_CONFIG = {
    ADMIN: {
        label: 'Administrador',
        gradient: 'from-indigo-500 to-purple-500',
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        text: 'text-indigo-600 dark:text-indigo-400',
        border: 'border-indigo-200 dark:border-indigo-800/40',
        icon: Shield,
    },
    CAJERO: {
        label: 'Cajero',
        gradient: 'from-emerald-500 to-teal-500',
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800/40',
        icon: ShoppingCart,
    }
};

// ─── PIN Input (4 digits) ─────────────────────────
function PinInput({ value, onChange, label }) {
    const digits = (value || '').padEnd(4, '').slice(0, 4).split('');

    const handleChange = (index, digit) => {
        if (!/^\d?$/.test(digit)) return;
        const newDigits = [...digits];
        newDigits[index] = digit;
        onChange(newDigits.join('').replace(/ /g, ''));

        // Auto-focus next
        if (digit && index < 3) {
            const next = document.getElementById(`pin-${label}-${index + 1}`);
            next?.focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            const prev = document.getElementById(`pin-${label}-${index - 1}`);
            prev?.focus();
        }
    };

    return (
        <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3].map(i => (
                <input
                    key={i}
                    id={`pin-${label}-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digits[i]?.trim() || ''}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-black bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none text-slate-800 dark:text-white transition-all"
                />
            ))}
        </div>
    );
}

// ─── User Row ──────────────────────────────────────
function UserRow({ user, currentUserId, onChangePin, onDelete, onEditName, triggerHaptic }) {
    const roleString = user.role || user.rol || 'CAJERO';
    const nameString = user.name || user.nombre || 'Desconocido';
    
    const roleConf = ROLE_CONFIG[roleString] || ROLE_CONFIG.CAJERO;
    const RoleIcon = roleConf.icon;
    const isCurrentUser = user.id === currentUserId;
    const isAdmin = roleString === 'ADMIN';

    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isCurrentUser ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200/50 dark:border-indigo-800/30' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}>
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${roleConf.gradient} flex items-center justify-center shrink-0 shadow-sm relative`}>
                <span className="text-white font-black text-lg">{(nameString)[0].toUpperCase()}</span>
                {isAdmin && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <Crown size={12} className="text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{nameString}</p>
                    {isCurrentUser && (
                        <span className="text-[8px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 px-1.5 py-0.5 rounded-full">Tu</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <RoleIcon size={10} className={roleConf.text} />
                    <span className={`text-[9px] font-black uppercase tracking-wider ${roleConf.text}`}>
                        {roleConf.label}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => { triggerHaptic?.(); onChangePin(user); }}
                    className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all active:scale-90"
                    title="Cambiar PIN"
                >
                    <KeyRound size={16} />
                </button>
                <button
                    onClick={() => { triggerHaptic?.(); onEditName(user); }}
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-90"
                    title="Editar Nombre"
                >
                    <Edit2 size={16} />
                </button>
                {!isCurrentUser && (
                    <button
                        onClick={() => { triggerHaptic?.(); onDelete(user); }}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-90"
                        title="Eliminar"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

import { supabaseCloud } from '../../config/supabaseCloud';
import { hashPin } from '../../utils/crypto';

// ═══════════════════════════════════════════════════ MAIN
export default function UsersManager({ triggerHaptic }) {
    const { cachedUsers: usuarios, currentUser: usuarioActivo, syncUsers } = useAuthStore();

    // Siempre sincronizar al montar para tener UUIDs frescos de Supabase
    useEffect(() => {
        syncUsers();
    }, []);

    // States
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('CAJERO');
    const [newPin, setNewPin] = useState('');

    const [changePinUser, setChangePinUser] = useState(null);
    const [pinValue, setPinValue] = useState('');
    const [showPin, setShowPin] = useState(false);

    const [deleteUser, setDeleteUser] = useState(null);

    const [editNameUser, setEditNameUser] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');

    // ─── Handlers ────────────────────────────────────
    const handleAdd = async () => {
        if (!newName.trim()) return showToast('Ingresa un nombre', 'error');
        if (newPin.length !== 4) return showToast('El PIN debe tener 4 digitos', 'error');

        try {
            const hashedPin = await hashPin(newPin);
            const { error } = await supabaseCloud
                .from('staff_users')
                .insert({
                    name: newName.trim(),
                    role: newRole,
                    pin_hash: hashedPin,
                    active: true
                });

            if (error) throw error;

            showToast(`Usuario "${newName.trim()}" creado`, 'success');
            triggerHaptic?.();
            setNewName('');
            setNewRole('CAJERO');
            setNewPin('');
            setShowAddForm(false);
            
            await syncUsers(); // Actualiza LocalForage y Zustand
        } catch (err) {
            console.error('Error al agregar usuario:', err);
            showToast('Ocurrió un error al crear el usuario', 'error');
        }
    };

    const handleChangePin = async () => {
        if (pinValue.length !== 4) return showToast('El PIN debe tener 4 digitos', 'error');

        try {
            const hashedPin = await hashPin(pinValue);
            const { error } = await supabaseCloud
                .from('staff_users')
                .update({ pin_hash: hashedPin })
                .eq('id', changePinUser.id);
                
            if (error) throw error;

            showToast(`PIN de ${changePinUser.nombre || changePinUser.name} actualizado`, 'success');
            triggerHaptic?.();
            setChangePinUser(null);
            setPinValue('');
            
            await syncUsers();
        } catch (err) {
            console.error('Error al cambiar PIN:', err);
            showToast('Ocurrió un error al actualizar el PIN', 'error');
        }
    };

    const handleDelete = async () => {
        try {
            // Soft delete
            const { error } = await supabaseCloud
                .from('staff_users')
                .update({ active: false })
                .eq('id', deleteUser.id);

            if (error) throw error;

            showToast(`"${deleteUser.nombre || deleteUser.name}" eliminado`, 'success');
            triggerHaptic?.();
            setDeleteUser(null);
            
            await syncUsers();
        } catch (err) {
            console.error('Error al eliminar usuario:', err);
            showToast('No se puede eliminar este usuario', 'error');
        }
    };

    const handleEditName = async () => {
        if (!editNameValue.trim()) return showToast('Ingresa un nombre válido', 'error');

        try {
            const { error } = await supabaseCloud
                .from('staff_users')
                .update({ name: editNameValue.trim() })
                .eq('id', editNameUser.id);
                
            if (error) throw error;
            
            showToast(`Nombre actualizado a ${editNameValue.trim()}`, 'success');
            triggerHaptic?.();
            setEditNameUser(null);
            setEditNameValue('');
            
            await syncUsers();
        } catch (err) {
            console.error('Error al editar usuario:', err);
            showToast('Error al modificar el nombre', 'error');
        }
    };

    return (
        <div className="space-y-4">
            {/* User List */}
            <div className="space-y-2">
                {usuarios.map(user => (
                    <UserRow
                        key={user.id}
                        user={user}
                        currentUserId={usuarioActivo?.id}
                        onChangePin={u => { setChangePinUser(u); setPinValue(''); setShowPin(false); }}
                        onEditName={u => { setEditNameUser(u); setEditNameValue(u.name || u.nombre || ''); }}
                        onDelete={u => setDeleteUser(u)}
                        triggerHaptic={triggerHaptic}
                    />
                ))}
            </div>

            {/* Add Button / Form */}
            {!showAddForm ? (
                <button
                    onClick={() => { triggerHaptic?.(); setShowAddForm(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors active:scale-[0.98] border border-dashed border-indigo-300 dark:border-indigo-700"
                >
                    <UserPlus size={16} /> Agregar Usuario
                </button>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800/40 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                            <UserPlus size={16} className="text-indigo-500" /> Nuevo Usuario
                        </h4>
                        <button onClick={() => setShowAddForm(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Nombre</label>
                        <input
                            type="text"
                            placeholder="Ej: Maria, Juan"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                            autoFocus
                        />
                    </div>

                    {/* Role Selector */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Rol</label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(ROLE_CONFIG).map(([key, conf]) => {
                                const Icon = conf.icon;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setNewRole(key)}
                                        className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all border flex items-center justify-center gap-2 ${newRole === key
                                            ? `${conf.bg} ${conf.border} ${conf.text} shadow-sm`
                                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        <Icon size={14} /> {conf.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* PIN */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">PIN de 4 digitos</label>
                        <PinInput value={newPin} onChange={setNewPin} label="new" />
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleAdd}
                        disabled={!newName.trim() || newPin.length !== 4}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-md shadow-indigo-500/20 disabled:shadow-none"
                    >
                        <Check size={16} /> Crear Usuario
                    </button>
                </div>
            )}

            {/* ─── Change PIN Modal ────────────────────── */}
            {changePinUser && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setChangePinUser(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className={`w-14 h-14 mx-auto rounded-xl bg-gradient-to-br ${ROLE_CONFIG[changePinUser.role || changePinUser.rol]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center mb-3`}>
                                <span className="text-white font-black text-2xl">{(changePinUser.name || changePinUser.nombre || 'U')[0].toUpperCase()}</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">Cambiar PIN</h3>
                            <p className="text-xs text-slate-400 mt-1">{changePinUser.name || changePinUser.nombre}</p>
                        </div>

                        <div className="mb-4">
                            <PinInput value={pinValue} onChange={setPinValue} label="change" />
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-5">
                            <button
                                onClick={() => setShowPin(!showPin)}
                                className="text-[10px] text-slate-400 flex items-center gap-1 hover:text-slate-600 transition-colors"
                            >
                                {showPin ? <EyeOff size={12} /> : <Eye size={12} />}
                                {showPin ? `PIN: ${pinValue || '----'}` : 'Mostrar PIN'}
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setChangePinUser(null)}
                                className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleChangePin}
                                disabled={pinValue.length !== 4}
                                className="flex-1 py-3 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Delete Confirmation ─────────────────── */}
            {deleteUser && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDeleteUser(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 mx-auto bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">Eliminar Usuario</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            ¿Seguro que deseas eliminar a <strong>"{deleteUser.name || deleteUser.nombre}"</strong>? Esta accion no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteUser(null)}
                                className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl active:scale-95 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 active:scale-95 transition-all"
                            >
                                Si, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Edit Name Modal ────────────────────── */}
            {editNameUser && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setEditNameUser(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-6">
                            <div className={`w-14 h-14 mx-auto rounded-xl bg-gradient-to-br ${ROLE_CONFIG[editNameUser.role || editNameUser.rol]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center mb-3`}>
                                <span className="text-white font-black text-2xl">{(editNameUser.name || editNameUser.nombre || 'U')[0].toUpperCase()}</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">Cambiar Nombre</h3>
                            <p className="text-xs text-slate-400 mt-1">{editNameUser.role || editNameUser.rol}</p>
                        </div>

                        <div className="mb-6">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 ml-1">Nuevo Nombre</label>
                            <input
                                autoFocus
                                type="text"
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none text-slate-800 dark:text-white transition-all text-center"
                                placeholder="..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setEditNameUser(null)}
                                className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleEditName}
                                disabled={!editNameValue.trim()}
                                className="flex-1 py-3 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
