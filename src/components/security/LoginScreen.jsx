import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { useCashStore } from '../../hooks/store/cashStore';
import UserCard from './UserCard';
import LoginPinModal from './LoginPinModal';
import { LogOut, DownloadCloud } from 'lucide-react';
import { supabaseCloud } from '../../config/supabaseCloud';

export default function LoginScreen() {
    const { cachedUsers, login, syncUsers, logout } = useAuthStore();
    const { activeCashSession } = useCashStore();
    
    const [selectedUser, setSelectedUser] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Initial sync of users if empty
    useEffect(() => {
        if (cachedUsers.length === 0) {
            handleForceSync();
        }
    }, [cachedUsers.length]);

    const handleForceSync = async () => {
        setIsSyncing(true);
        await syncUsers();
        setIsSyncing(false);
    };

    const handlePinSubmit = async (pin, userId) => {
        const success = await login(userId, pin);
        if (success) {
            setSelectedUser(null);
        }
        return success;
    };

    const handleCloudLogout = async () => {
        const ok = window.confirm('¿Cerrar sesión remota? Se borrará todo caché.');
        if (!ok) return;
        await logout();
        await supabaseCloud.auth.signOut();
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-50 text-slate-800 font-sans flex flex-col justify-center items-center overflow-auto min-h-screen">
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-[30%] -left-[15%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px]" />
                <div className="absolute -bottom-[30%] -right-[15%] w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 w-full p-6 flex flex-col items-center flex-1 justify-center min-h-[500px]">
                {/* Header */}
                <div className="text-center mb-14">
                    <div className="flex justify-center mb-6">
                        <img src="/logo.png" alt="Logo" className="h-48 sm:h-64 w-auto object-contain drop-shadow-md" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-light tracking-[0.15em] text-slate-500">
                        Quien esta <strong className="text-slate-800 font-bold">operando</strong>?
                    </h1>
                </div>

                <div className="w-full flex justify-center">
                    {cachedUsers.length === 0 ? (
                        <div className="text-center text-slate-500 mb-8 max-w-sm">
                            <p className="mb-4">No hay usuarios en caché.</p>
                            <button 
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                className="px-6 py-2 bg-sky-500 text-white rounded-full font-medium shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 w-full"
                            >
                                <DownloadCloud className={`w-5 h-5 ${isSyncing ? 'animate-bounce' : ''}`} />
                                {isSyncing ? "Sincronizando..." : "Sincronizar ahora"}
                            </button>
                        </div>
                    ) : (
                        <div className="w-full grid grid-cols-2 md:flex md:flex-row md:flex-wrap md:justify-center gap-8 sm:gap-14 max-w-[320px] md:max-w-5xl mx-auto">
                            {cachedUsers.map(user => (
                                <UserCard
                                    key={user.id}
                                    user={user}
                                    onClick={() => setSelectedUser(user)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 w-full pb-8 text-center flex flex-col items-center gap-4 mt-auto">
                <p className="text-[10px] text-slate-600 font-medium tracking-wider">
                    PIN de 4 digitos requerido
                </p>
                <div className="flex items-center gap-6">
                    <button
                        onClick={handleForceSync}
                        disabled={isSyncing}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-sky-500 transition-colors disabled:opacity-50"
                    >
                        <DownloadCloud className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                        Refrescar
                    </button>
                    <button
                        onClick={handleCloudLogout}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500/60 hover:text-rose-400 transition-colors"
                    >
                        <LogOut className="w-3 h-3" strokeWidth={2.5} />
                        Cerrar sesión
                    </button>
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
