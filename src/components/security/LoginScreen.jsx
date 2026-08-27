import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import UserCard from './UserCard';
import LoginPinModal from './LoginPinModal';
import SuperAdminModal from './SuperAdminModal';
import { DownloadCloud } from 'lucide-react';

export default function LoginScreen() {
    const { cachedUsers, loginWithBiometric, verifyPin, syncUsers, loginAsSuperAdmin } = useAuthStore();
    const visibleUsers = cachedUsers.filter(user => user.active !== false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSuperModal, setShowSuperModal] = useState(false);

    // Contador de clicks en logo para abrir modal super admin (10 clics en 2.5s)
    const logoClickCount = useRef(0);
    const logoClickTimer = useRef(null);

    const handleLogoClick = useCallback(() => {
        logoClickCount.current += 1;
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
        clearTimeout(logoClickTimer.current);
        if (logoClickCount.current >= 10) {
            logoClickCount.current = 0;
            setShowSuperModal(true);
        } else {
            logoClickTimer.current = setTimeout(() => {
                logoClickCount.current = 0;
            }, 2500);
        }
    }, []);

    const handleForceSync = useCallback(async () => {
        setIsSyncing(true);
        await syncUsers();
        setIsSyncing(false);
    }, [syncUsers]);

    useEffect(() => {
        // Diferir la sincronización evita actualizar estado durante el commit inicial.
        const timer = setTimeout(() => { handleForceSync(); }, 0);
        return () => clearTimeout(timer);
    }, [handleForceSync]);

    // Verificar PIN sin activar sesión (para dar chance al prompt biométrico)
    const handlePinVerify = async (pin, userId) => {
        await new Promise(r => setTimeout(r, 350)); // feedback visual
        return await verifyPin(userId, pin);
    };

    // Activar sesión real (llamado por el modal después del prompt biométrico)
    const handleLoginComplete = async (userId) => {
        await loginWithBiometric(userId);
        setSelectedUser(null);
    };

    const handleBiometricLogin = async (userId) => {
        const success = await loginWithBiometric(userId);
        if (success) setSelectedUser(null);
        return success;
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-50 text-slate-800 font-sans" style={{ overflowY: 'auto' }}>
            {/* Background glow — decorativo, no interfiere con layout */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-[30%] -left-[15%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px]" />
                <div className="absolute -bottom-[30%] -right-[15%] w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[120px]" />
            </div>

            {/* Contenedor principal — siempre ocupa al menos la pantalla completa */}
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-between px-6 py-8 gap-6">

                {/* ── LOGO + TÍTULO ── */}
                <div className="text-center flex flex-col items-center gap-2 w-full">
                    <img
                        src="/logo.png"
                        alt="Logo"
                        onClick={handleLogoClick}
                        className="w-auto object-contain drop-shadow-xl cursor-pointer select-none active:scale-95 transition-transform"
                        style={{ height: 'clamp(110px, 28vw, 180px)' }}
                    />
                    <h1 className="text-2xl sm:text-3xl font-light tracking-[0.15em] text-slate-500">
                        Quien esta <strong className="text-slate-800 font-bold">operando</strong>?
                    </h1>
                </div>

                {/* ── GRID DE USUARIOS ── */}
                <div className="w-full flex-1 flex items-center justify-center py-4">
                    {visibleUsers.length === 0 ? (
                        <div className="text-center text-slate-500 max-w-xs w-full">
                            <p className="mb-4 text-sm">No hay usuarios en caché.</p>
                            <button
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                className="px-6 py-2 bg-sky-500 text-white rounded-full font-medium shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 w-full"
                            >
                                <DownloadCloud className={`w-5 h-5 ${isSyncing ? 'animate-bounce' : ''}`} />
                                {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                            </button>
                        </div>
                    ) : (
                        /* Flex wrap: se ajusta automáticamente al número de cards (1,2,3,N).
                           En móvil max 2 por fila; en pantallas más grandes toda en fila. */
                        <div
                            className={`flex flex-wrap justify-center gap-8 sm:gap-12 ${visibleUsers.length <= 2 ? 'max-w-xs sm:max-w-sm' : 'max-w-[320px] sm:max-w-md md:max-w-lg'}`}
                        >
                            {visibleUsers.map(user => (
                                <div
                                    key={user.id}
                                    style={{ flexBasis: 'calc(50% - 16px)', maxWidth: '130px', minWidth: '100px' }}
                                >
                                    <UserCard
                                        user={user}
                                        onClick={() => setSelectedUser(user)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── FOOTER ── */}
                <div className="w-full text-center flex flex-col items-center gap-3">
                    <p className="text-[10px] sm:text-xs text-slate-600 font-medium tracking-wider">
                        Ingresa tu PIN asignado
                    </p>
                    <div className="flex items-center gap-6">
                        <button
                            onClick={handleForceSync}
                            disabled={isSyncing}
                            className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-slate-400 hover:text-sky-500 transition-colors disabled:opacity-50"
                        >
                            <DownloadCloud className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                            Refrescar
                        </button>
                    </div>
                </div>

            </div>

            {/* PIN Modal */}
            <LoginPinModal
                isOpen={!!selectedUser}
                onClose={() => setSelectedUser(null)}
                user={selectedUser}
                onVerifyPin={handlePinVerify}
                onLoginComplete={handleLoginComplete}
                onBiometricLogin={handleBiometricLogin}
            />

            {/* Super Admin Modal */}
            <SuperAdminModal
                isOpen={showSuperModal}
                onClose={() => setShowSuperModal(false)}
                onSuccess={async (password) => {
                    const ok = await loginAsSuperAdmin(password);
                    if (ok) setShowSuperModal(false);
                    return ok;
                }}
            />
        </div>
    );
}
