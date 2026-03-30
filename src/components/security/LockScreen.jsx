import React, { useState } from 'react';
import { useAuthStore } from '../../hooks/store/useAuthStore';
import UserCard from './UserCard';
import LoginPinModal from './LoginPinModal';

export default function LockScreen() {
  const { usuarios, login } = useAuthStore();
  const [selectedUser, setSelectedUser] = useState(null);

  const handlePinSubmit = async (pin, userId) => {
    const success = await login(pin, userId);
    if (success) {
      setSelectedUser(null);
    }
    return success;
  };

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950 text-white font-sans overflow-hidden flex flex-col">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -left-[15%] w-[600px] h-[600px] bg-indigo-600/8 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[30%] -right-[15%] w-[600px] h-[600px] bg-emerald-600/8 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 p-6">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex justify-center mb-6">
            <img src="/logodark.png" alt="Logo" className="h-14 sm:h-16 w-auto object-contain drop-shadow-md" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-light tracking-[0.15em] text-slate-300">
            Quien esta{' '}
            <strong className="text-white font-bold">operando</strong>?
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
      <div className="relative z-10 pb-6 text-center">
        <p className="text-[10px] text-slate-600 font-medium tracking-wider">
          PIN de 4 digitos requerido
        </p>
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
