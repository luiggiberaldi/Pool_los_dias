import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, Loader2, Fingerprint, Check, ChevronRight } from 'lucide-react';
import LoginAvatar from './LoginAvatar';
import {
    isBiometricAvailable,
    isRegistered, registerBiometric, authenticateWithBiometric
} from '../../services/biometricPinService';

export default function LoginPinModal({ isOpen, onClose, user, onSubmit, onVerifyPin, onLoginComplete, onBiometricLogin }) {
    const targetPinLength = (user?.role === 'ADMIN' || user?.rol === 'ADMIN') ? 6 : 4;
    const [pin, setPin]               = useState('');
    const [error, setError]           = useState(false);
    const [processing, setProcessing] = useState(false);

    // ── Biometría ────────────────────────────────────────────────────────────
    const [bioAvailable, setBioAvailable]     = useState(false);
    const [bioRegistered, setBioRegistered]   = useState(false);
    const [bioLoading, setBioLoading]         = useState(false);

    // Setup prompt: aparece después de PIN exitoso en móvil si no hay huella registrada
    const [keepOpen, setKeepOpen]             = useState(false);
    const [showSetupPrompt, setShowSetupPrompt] = useState(false);
    const [setupLoading, setSetupLoading]     = useState(false);
    const [setupDone, setSetupDone]           = useState(false);

    const userId   = user?.id;
    const userName = (user?.name || user?.nombre || 'Usuario')
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    // Chequear disponibilidad biométrica al seleccionar un usuario
    useEffect(() => {
        if (!isOpen || !userId) return;
        setPin('');
        setError(false);
        setShowSetupPrompt(false);
        setSetupDone(false);
        setKeepOpen(false);

        const check = async () => {
            const available = await isBiometricAvailable();
            setBioAvailable(available);
            if (available) setBioRegistered(isRegistered(userId));
        };
        check();
    }, [isOpen, userId]);

    // ── PIN submit ────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (pin.length !== targetPinLength || processing || showSetupPrompt) return;
        setProcessing(true);

        // Si hay verificación separada (flujo biométrico), usarla
        const verify = onVerifyPin || onSubmit;
        const success = await verify(pin, userId);

        if (!success) {
            setError(true);
            setPin('');
            setProcessing(false);
            setTimeout(() => setError(false), 600);
            return;
        }

        // PIN correcto, sin huella registrada → ofrecer activarla ANTES de loguearse
        if (onVerifyPin && bioAvailable && !bioRegistered) {
            setPin('');
            setKeepOpen(true);
            setShowSetupPrompt(true);
            setProcessing(false);
        } else {
            // Activar sesión y cerrar
            if (onLoginComplete) {
                await onLoginComplete(userId);
            } else if (onSubmit && !onVerifyPin) {
                // Fallback: onSubmit ya hizo el login
            }
            setProcessing(false);
            onClose();
        }
    }, [pin, processing, showSetupPrompt, onSubmit, onVerifyPin, onLoginComplete, userId, targetPinLength, bioAvailable, bioRegistered, onClose]);

    // Auto-submit al completar dígitos
    useEffect(() => {
        if (pin.length === targetPinLength && !processing) handleSubmit();
    }, [pin, processing, targetPinLength, handleSubmit]);

    // Teclado físico (desktop)
    useEffect(() => {
        if (!isOpen && !keepOpen) return;
        const isTouchDevice = 'ontouchstart' in window && window.innerWidth < 1024;
        if (isTouchDevice) return;
        const handleKey = (e) => {
            if (e.key >= '0' && e.key <= '9') handlePadPress(e.key);
            else if (e.key === 'Backspace') handleDelete();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, keepOpen, pin, processing]);

    // ── Login con huella ──────────────────────────────────────────────────────
    const handleBiometricLogin = async () => {
        if (bioLoading) return;
        setBioLoading(true);
        try {
            await authenticateWithBiometric(userId);
            await onBiometricLogin(userId);
        } catch (err) {
            if (!err.message?.includes('cancel') && !err.message?.toLowerCase().includes('abort')) {
                setError(true);
                setTimeout(() => setError(false), 800);
            }
        } finally {
            setBioLoading(false);
        }
    };

    // ── Registro de huella (después de PIN) ───────────────────────────────────
    const handleRegister = async () => {
        setSetupLoading(true);
        try {
            await registerBiometric(userId, userName);
            setSetupDone(true);
            setBioRegistered(true);
            setTimeout(async () => {
                if (onLoginComplete) await onLoginComplete(userId);
                setKeepOpen(false);
                setShowSetupPrompt(false);
                onClose();
            }, 1400);
        } catch (err) {
            if (!err.message?.includes('cancel') && !err.message?.toLowerCase().includes('abort')) {
                // Error real → activar sesión y cerrar
                if (onLoginComplete) await onLoginComplete(userId);
                setKeepOpen(false);
                setShowSetupPrompt(false);
                onClose();
            } else {
                setSetupLoading(false);
            }
        }
    };

    const handleSkipSetup = async () => {
        if (onLoginComplete) await onLoginComplete(userId);
        setKeepOpen(false);
        setShowSetupPrompt(false);
        onClose();
    };

    const handlePadPress = (digit) => {
        if (pin.length >= targetPinLength || processing) return;
        setPin(prev => prev + digit);
    };

    const handleDelete = () => {
        if (processing) return;
        setPin(prev => prev.slice(0, -1));
    };

    const visible = (isOpen || keepOpen) && !!user;
    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={showSetupPrompt ? undefined : onClose}
        >
            <div
                className="relative bg-white rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Setup de huella (post PIN) ── */}
                {showSetupPrompt ? (
                    <div className="flex flex-col items-center text-center">
                        {setupDone ? (
                            <>
                                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                                    <Check size={32} className="text-emerald-500" />
                                </div>
                                <p className="text-lg font-bold text-slate-800">¡Huella activada!</p>
                                <p className="text-sm text-slate-400 mt-1">La próxima vez entrás con el dedo</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mb-5">
                                    <Fingerprint size={32} className="text-sky-500" />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800 mb-1">¿Activar acceso por huella?</h2>
                                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                                    La próxima vez que ingreses como <strong>{userName}</strong>, solo necesitás poner el dedo.
                                </p>
                                <button
                                    onClick={handleRegister}
                                    disabled={setupLoading}
                                    className="w-full py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 mb-3"
                                >
                                    {setupLoading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <><Fingerprint size={16} /> Activar huella</>
                                    }
                                </button>
                                <button
                                    onClick={handleSkipSetup}
                                    className="text-xs text-slate-400 hover:text-slate-600 py-2 transition-colors"
                                >
                                    Ahora no
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {/* ── Cerrar ── */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-full hover:bg-slate-100"
                        >
                            <X size={20} />
                        </button>

                        {/* ── Avatar + Nombre ── */}
                        <div className="flex flex-col items-center mb-6">
                            <div className="mb-4"><LoginAvatar user={user} /></div>
                            <h2 className="text-lg sm:text-xl font-bold text-slate-800">{userName}</h2>
                            <p className="text-xs text-slate-500 mt-1">Ingresa tu PIN de {targetPinLength} dígitos</p>
                        </div>

                        {/* ── Huella (si disponible y registrada) ── */}
                        {bioAvailable && bioRegistered && (
                            <button
                                onClick={handleBiometricLogin}
                                disabled={bioLoading}
                                className="w-full mb-5 py-3 rounded-2xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-600 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                            >
                                {bioLoading
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : <><Fingerprint size={16} /> Entrar con huella</>
                                }
                            </button>
                        )}

                        {/* ── PIN Dots ── */}
                        <div className={`flex justify-center gap-3 mb-6 ${error ? 'animate-shake' : ''}`}>
                            {Array.from({ length: targetPinLength }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                                        error
                                            ? 'bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                                            : i < pin.length
                                                ? 'bg-sky-500 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.4)] scale-110'
                                                : 'bg-transparent border-slate-300'
                                    }`}
                                />
                            ))}
                        </div>

                        {/* ── Numpad ── */}
                        <div className="grid grid-cols-3 gap-3 max-w-[280px] sm:max-w-xs md:max-w-sm mx-auto">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                <button
                                    key={n}
                                    onClick={() => handlePadPress(String(n))}
                                    className="h-14 rounded-xl bg-slate-50 text-slate-800 text-lg sm:text-xl font-bold hover:bg-slate-100 active:scale-95 active:bg-sky-50 transition-all duration-150 border border-slate-200 shadow-sm"
                                >
                                    {n}
                                </button>
                            ))}
                            <div />
                            <button
                                onClick={() => handlePadPress('0')}
                                className="h-14 rounded-xl bg-slate-50 text-slate-800 text-xl font-bold hover:bg-slate-100 active:scale-95 active:bg-sky-50 transition-all duration-150 border border-slate-200 shadow-sm"
                            >
                                0
                            </button>
                            <button
                                onClick={handleDelete}
                                className="h-14 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 active:scale-95 transition-all duration-150 border border-slate-200 shadow-sm"
                            >
                                <Delete size={22} />
                            </button>
                        </div>
                    </>
                )}

                {/* ── Processing overlay ── */}
                {processing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-3xl flex items-center justify-center">
                        <Loader2 className="animate-spin text-sky-500" size={32} />
                    </div>
                )}
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-10px); }
                    40% { transform: translateX(10px); }
                    60% { transform: translateX(-6px); }
                    80% { transform: translateX(6px); }
                }
                .animate-shake { animation: shake 0.4s ease-in-out; }
            `}</style>
        </div>
    );
}
