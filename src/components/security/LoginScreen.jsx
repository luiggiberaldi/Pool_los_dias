import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { useCashStore } from '../../hooks/store/cashStore';
import UserCard from './UserCard';
import LoginPinModal from './LoginPinModal';
import { LogOut, DownloadCloud } from 'lucide-react';
import { supabaseCloud } from '../../config/supabaseCloud';
import { useConfirm } from '../../hooks/useConfirm.jsx';

export default function LoginScreen() {
    const { cachedUsers, login, syncUsers, logout } = useAuthStore();
    const { activeCashSession } = useCashStore();
    const confirm = useConfirm();
    
    const [selectedUser, setSelectedUser] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const handleForceSync = async () => {
        setIsSyncing(true);
        await syncUsers();
        setIsSyncing(false);
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        // Siempre sincronizar al montar para tener usuarios actualizados
        handleForceSync();
    }, []);

    const handlePinSubmit = async (pin, userId) => {
        const success = await login(userId, pin);
        if (success) setSelectedUser(null);
        return success;
    };

    const handleCloudLogout = async () => {
        const ok = await confirm({
            title: '¿Cerrar sesión remota?',
            message: 'Se borrará todo caché.',
            confirmText: 'Sí, cerrar sesión',
            variant: 'logout'
        });
        if (!ok) return;
        await logout();
        await supabaseCloud.auth.signOut();
        window.location.reload();
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
                        className="w-auto object-contain drop-shadow-xl"
                        style={{ height: 'clamp(110px, 28vw, 180px)' }}
                    />
                    <h1 className="text-2xl sm:text-3xl font-light tracking-[0.15em] text-slate-500">
                        Quien esta <strong className="text-slate-800 font-bold">operando</strong>?
                    </h1>
                </div>

                {/* ── GRID DE USUARIOS ── */}
                <div className="w-full flex-1 flex items-center justify-center py-4">
                    {cachedUsers.length === 0 ? (
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
                            className={`flex flex-wrap justify-center gap-8 sm:gap-12 ${cachedUsers.length <= 2 ? 'max-w-xs sm:max-w-sm' : 'max-w-[320px] sm:max-w-md md:max-w-lg'}`}
                        >
                            {cachedUsers.map(user => (
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
                        <button
                            onClick={handleCloudLogout}
                            className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-rose-500/60 hover:text-rose-400 transition-colors"
                        >
                            <LogOut className="w-3 h-3" strokeWidth={2.5} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>

            </div>

            {/* PIN Modal */}
            <LoginPinModal
                isOpen={!!selectedUser}
                onClose={() => setSelectedUser(null)}
                user={selectedUser}
                onSubmit={handlePinSubmit}
            />
        </div>
    );
}
