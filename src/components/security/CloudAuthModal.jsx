import React, { useEffect, useState } from 'react';
import { 
    Cloud, Lock, Mail, Key, Phone, ArrowRight, ShieldCheck, 
    Smartphone, Database, AlertCircle, Trash2, X, Download, Eye, EyeOff, LogOut
} from 'lucide-react';
import { useCloudAuthLogic } from '../../hooks/useCloudAuthLogic';
import { Modal } from '../Modal';
import { supabaseCloud } from '../../config/supabaseCloud';
import { useConfirm } from '../../hooks/useConfirm.jsx';

export default function CloudAuthModal({ isOpen, onClose, forceLogin = false }) {
    const authLogic = useCloudAuthLogic();
    const {
        inputEmail, setInputEmail,
        inputPassword, setInputPassword,
        inputPhone, setInputPhone,
        isCloudLogin, setIsCloudLogin,
        emailError, setEmailError,
        passwordError, setPasswordError,
        isRecoveringPassword, setIsRecoveringPassword,
        deviceLimitError, setDeviceLimitError,
        blockedDevices, setBlockedDevices,
        dataConflictPending, setDataConflictPending,
        importStatus, setImportStatus,
        statusMessage, setStatusMessage,
        localDeviceAlias, setLocalDeviceAlias,
        handleDataConflictChoice,
        handleUnlinkSpecificDevice,
        handleSaveCloudAccount,
        handleResetPasswordRequest
    } = authLogic;

    // Local state for UI
    const [showPassword, setShowPassword] = useState(false);
    const confirm = useConfirm();

    if (!isOpen && !forceLogin) return null;

    // Render Data Conflict View
    if (dataConflictPending) {
        return (
            <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-8 sm:pb-4 animate-in fade-in">
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                    <div className="bg-amber-500 px-6 py-5 text-white">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <AlertCircle size={24} />
                            </div>
                            <span className="font-black text-lg">Conflicto de Datos</span>
                        </div>
                        <p className="text-sm text-white/90 mt-2">Hemos detectado datos tanto en este dispositivo como en tu nube. ¿Con cuáles quieres quedarte?</p>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: 'Restaurar desde la nube',
                                        message: 'Se perderán los datos locales no sincronizados de esta PC y se descargarán los datos respaldados en la nube. ¿Deseas continuar?',
                                        confirmText: 'Sí, restaurar nube',
                                        cancelText: 'Cancelar',
                                        variant: 'warning'
                                    });
                                    if (ok) handleDataConflictChoice('cloud');
                                }}
                                className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:scale-95 transition-all"
                            >
                                <Database size={32} />
                                <span className="text-sm font-black text-center leading-tight">Restaurar Nube</span>
                                <span className="text-[10px] text-indigo-500 dark:text-indigo-400 text-center font-medium">Baja los datos y borra este equipo</span>
                            </button>
                            <button
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: '¡Peligro! Sobreescribir Nube',
                                        message: 'Eliminarás TODO el inventario almacenado actualmente en la nube para esta cuenta y lo reemplazarás con los datos de esta computadora. Esta acción es irreversible.\n\n¿Estás absolutamente seguro?',
                                        confirmText: 'Sí, sobreescribir nube',
                                        cancelText: 'Cancelar',
                                        variant: 'danger'
                                    });
                                    if (ok) handleDataConflictChoice('local');
                                }}
                                className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:border-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all"
                            >
                                <Download size={32} />
                                <span className="text-sm font-black text-center leading-tight">Subir Local</span>
                                <span className="text-[10px] text-red-500 dark:text-red-400 text-center font-bold">¡Peligro! Sobreescribe y borra la nube</span>
                            </button>
                        </div>
                        <div className="bg-red-50 dark:bg-red-500/10 p-4 rounded-xl border border-red-200 dark:border-red-500/20 flex flex-col items-center gap-2">
                            <AlertCircle size={20} className="text-red-500" />
                            <p className="text-xs text-center text-red-600 dark:text-red-400 font-bold">
                                Atención: Si eliges "Subir Local", eliminarás TODO el inventario almacenado actualmente en la nube para esta cuenta.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Render Device Limit Error
    if (deviceLimitError) {
        return (
            <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-8 sm:pb-4 animate-in fade-in">
                <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                    <div className="bg-red-500 px-6 py-5 text-white">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <Smartphone size={24} />
                            </div>
                            <span className="font-black text-lg">Límite de Dispositivos</span>
                        </div>
                        <p className="text-sm text-white/90 mt-2">Esta cuenta solo permite conectar un límite de <strong>{deviceLimitError.limit || 1} dispositivo(s)</strong> simultáneamente.</p>
                    </div>
                    <div className="p-6">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Tus sesiones activas ({blockedDevices.length} / {deviceLimitError.limit || 1}):</p>
                        <div className="space-y-2 mb-6 max-h-[40vh] overflow-y-auto pr-2">
                            {blockedDevices.map((d, i) => {
                                const isCurrent = d.device_id === deviceLimitError.currentId;
                                return (
                                <div key={d.device_id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${isCurrent ? 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/50' : 'bg-slate-50 dark:bg-slate-800/80 border-slate-100 dark:border-slate-700'}`}>
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${isCurrent ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-800 dark:text-indigo-300' : 'bg-white text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            <Smartphone size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm font-bold truncate flex items-center gap-2 ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                                {d.device_alias || `Caja ${i + 1}`}
                                                {isCurrent && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-black bg-indigo-500 text-white shadow-sm shrink-0">Este equipo</span>}
                                            </p>
                                            <p className={`text-[10px] ${isCurrent ? 'text-indigo-500/80 dark:text-indigo-400/80' : 'text-slate-400'}`}>
                                                Visto: {new Date(d.last_seen).toLocaleDateString('es-VE')}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const ok = await confirm({
                                                title: 'Expulsar equipo',
                                                message: `¿Seguro que deseas desconectar y expulsar a "${d.device_alias || `Caja ${i + 1}`}"?`,
                                                confirmText: 'Sí, expulsar',
                                                cancelText: 'Cancelar',
                                                variant: 'danger'
                                            });
                                            if (ok) handleUnlinkSpecificDevice(d.device_id);
                                        }}
                                        disabled={importStatus === 'loading'}
                                        className="px-3 py-1.5 border border-red-500/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        Expulsar
                                    </button>
                                </div>
                            )})}
                        </div>
                        <div className="space-y-3">
                            <button
                                onClick={() => { setDeviceLimitError(null); setBlockedDevices([]); setImportStatus(null); onClose(); }}
                                className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white text-sm font-black rounded-xl transition-all shadow-md"
                            >
                                Cancelar y volver
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Main Auth UI
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-white/20 dark:border-slate-800/50 overflow-hidden relative">
                
                {/* Decorative BG */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Close Button */}
                {!forceLogin && (
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20">
                        <X size={18} />
                    </button>
                )}

                <div className="p-6 relative z-10">
                    <div className="flex flex-col items-center justify-center mt-2 mb-6">
                        <img 
                            src="/logo.png" 
                            alt="Sistema Abasto Logo" 
                            className="h-24 w-auto object-contain drop-shadow-sm" 
                        />
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 font-medium text-center">
                            Respaldo en tiempo real y licencias multipunto.
                        </p>
                    </div>

                    {/* Tabs */}
                    {!isRecoveringPassword && (
                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl mb-6">
                            <button
                                onClick={() => { setIsCloudLogin(true); setEmailError(''); setPasswordError(''); }}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isCloudLogin ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                Entrar
                            </button>
                            <button
                                onClick={() => { setIsCloudLogin(false); setEmailError(''); setPasswordError(''); }}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isCloudLogin ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                Registro
                            </button>
                        </div>
                    )}

                    {/* Form */}
                    <div className="space-y-4">
                        {isRecoveringPassword ? (
                            <>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block ml-1">Correo de la cuenta</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <Mail size={16} className="text-slate-400" />
                                        </div>
                                        <input
                                            type="email"
                                            value={inputEmail}
                                            onChange={e => setInputEmail(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                            placeholder="bodega@correo.com"
                                        />
                                    </div>
                                    {emailError && <p className="text-xs text-red-500 font-medium ml-1 mt-1">{emailError}</p>}
                                </div>
                                <div className="pt-2">
                                    <button
                                        onClick={handleResetPasswordRequest}
                                        disabled={importStatus === 'loading'}
                                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white text-sm font-black rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        {importStatus === 'loading' ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Enviar correo de recuperación'}
                                    </button>
                                    <button
                                        onClick={() => setIsRecoveringPassword(false)}
                                        className="w-full mt-3 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                                    >
                                        Volver al login
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <Mail size={16} className="text-slate-400" />
                                        </div>
                                        <input
                                            type="email"
                                            value={inputEmail}
                                            onChange={e => setInputEmail(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                            placeholder="Correo electrónico"
                                        />
                                    </div>
                                    {emailError && <p className="text-[11px] text-red-500 font-bold mt-1 ml-1">{emailError}</p>}
                                </div>

                                {!isCloudLogin && (
                                    <div>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                <Phone size={16} className="text-slate-400" />
                                            </div>
                                            <input
                                                type="tel"
                                                value={inputPhone}
                                                onChange={e => setInputPhone(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                                placeholder="WhatsApp del negocio"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <Key size={16} className="text-slate-400" />
                                        </div>
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={inputPassword}
                                            onChange={e => setInputPassword(e.target.value)}
                                            className="w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                            placeholder="Contraseña segura"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-indigo-500 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    {passwordError && <p className="text-[11px] text-red-500 font-bold mt-1 ml-1">{passwordError}</p>}
                                </div>

                                <div>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <Smartphone size={16} className="text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={localDeviceAlias}
                                            onChange={e => setLocalDeviceAlias(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                            placeholder="Nombre para esta PC (Ej. Mostrador 2)"
                                        />
                                    </div>
                                </div>

                                {isCloudLogin && (
                                    <div className="flex justify-end">
                                        <button onClick={() => setIsRecoveringPassword(true)} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                                            ¿Olvidaste tu contraseña?
                                        </button>
                                    </div>
                                )}

                                {statusMessage && importStatus !== 'error' && (
                                    <div className="text-xs text-center text-indigo-600 dark:text-indigo-400 font-bold animate-pulse py-1">
                                        {statusMessage}
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        onClick={handleSaveCloudAccount}
                                        disabled={importStatus === 'loading'}
                                        className="w-full py-3.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-70 text-white dark:text-slate-900 text-sm font-black rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        {importStatus === 'loading' ? (
                                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                {isCloudLogin ? 'Conectar Estación' : 'Crear Cuenta Segura'}
                                                <ArrowRight size={16} strokeWidth={3} />
                                            </>
                                        )}
                                    </button>
                                </div>
                                {!isCloudLogin && (
                                    <p className="text-[10px] text-center text-slate-400 mt-2 flex items-center justify-center gap-1">
                                        <ShieldCheck size={12} />
                                        Conexión 100% encriptada. Tienes 15 días de prueba inicial.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
