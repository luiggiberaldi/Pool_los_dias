import React, { useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { useConfirm } from '../../hooks/useConfirm.jsx';
import UserCard from './UserCard';
import LoginPinModal from './LoginPinModal';
import SuperAdminModal from './SuperAdminModal';

import { LogOut } from 'lucide-react';

export default function LockScreen() {
  const { usuarios, loginWithBiometric, verifyPin, loginAsSuperAdmin } = useAuthStore();
  const [selectedUser, setSelectedUser] = useState(null);
  const [showSuperModal, setShowSuperModal] = useState(false);
  const confirm = useConfirm();

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

  // Verificar PIN sin activar sesión
  const handlePinVerify = async (pin, userId) => {
    await new Promise(r => setTimeout(r, 350));
    return await verifyPin(userId, pin);
  };

  // Activar sesión real (después del prompt biométrico)
  const handleLoginComplete = async (userId) => {
    await loginWithBiometric(userId);
    setSelectedUser(null);
  };

  const handleBiometricLogin = async (userId) => {
    await loginWithBiometric(userId);
    setSelectedUser(null);
  };

  const handleCloudLogout = async () => {
    const ok = await confirm({
      title: 'Cerrar sesión',
      message: 'Se cerrará tu sesión en la nube. Deberás iniciar sesión nuevamente para continuar.',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      variant: 'logout',
    });
    if (!ok) return;
    const { supabaseCloud } = await import('../../config/supabaseCloud');
    localStorage.removeItem('pool_had_cloud_session');
    await supabaseCloud.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-50 text-slate-800 font-sans overflow-hidden flex flex-col">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -left-[15%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[30%] -right-[15%] w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 p-6">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="Logo"
              onClick={handleLogoClick}
              className="h-24 sm:h-32 w-auto object-contain drop-shadow-md cursor-pointer select-none active:scale-95 transition-transform"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-light tracking-[0.15em] text-slate-500">
            Quien esta{' '}
            <strong className="text-slate-800 font-bold">operando</strong>?
          </h1>
        </div>

        {/* User Grid */}
        <div className="w-full grid grid-cols-2 md:flex md:flex-row md:flex-wrap md:justify-center gap-8 sm:gap-14 max-w-[320px] md:max-w-5xl mx-auto">
          {usuarios.map(user => (
            <UserCard
              key={user.id}
              user={user}
              onClick={() => setSelectedUser(user)}
            />
          ))}
        </div>
      </div>

      {/* Footer sutil */}
      <div className="relative z-10 pb-6 text-center flex flex-col items-center gap-3">
        <p className="text-[10px] text-slate-600 font-medium tracking-wider">
          PIN de 4 digitos requerido
        </p>
        <button
          onClick={handleCloudLogout}
          className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-rose-500/80 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" strokeWidth={2.5} />
          Cerrar sesión
        </button>
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
