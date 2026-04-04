import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logEvent } from '../../services/auditService';
import { hashPin } from '../../utils/crypto';

// Pre-computed SHA-256 hashes of default PINs (never store plaintext)
const DEFAULT_USERS = [
    { id: 1, nombre: 'Administrador', rol: 'ADMIN', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4' },
    { id: 2, nombre: 'Cajero', rol: 'CAJERO', pin_hash: '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0' }
];

// Rate limiting constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

export const useAuthStore = create(
    persist(
        (set, get) => ({
            usuarioActivo: (() => {
                try {
                    const saved = localStorage.getItem('abasto-device-session');
                    return saved ? JSON.parse(saved) : null;
                } catch { return null; }
            })(),
            usuarios: DEFAULT_USERS,
            requireLogin: false, // Login opcional, por defecto desactivado

            // Rate limiting state
            failedAttempts: 0,
            lockoutUntil: null,


            // ACCIONES
            login: async (pinInput, userId) => {
                // Check lockout
                const { lockoutUntil } = get();
                if (lockoutUntil && Date.now() < lockoutUntil) {
                    const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
                    return { locked: true, remainingSec };
                }

                // Clear expired lockout
                if (lockoutUntil && Date.now() >= lockoutUntil) {
                    set({ lockoutUntil: null, failedAttempts: 0 });
                }

                // Simular un pequeño retardo para feedback visual (UX)
                await new Promise(r => setTimeout(r, 400));

                const { usuarios } = get();

                // Hash the input PIN before comparing
                const hashedInput = await hashPin(pinInput);

                let userEncontrado;

                if (userId) {
                    userEncontrado = usuarios.find(u => u.id === userId && u.pin_hash === hashedInput);
                } else {
                    userEncontrado = usuarios.find(u => u.pin_hash === hashedInput);
                }

                if (userEncontrado) {
                    set({ usuarioActivo: userEncontrado, failedAttempts: 0, lockoutUntil: null });
                    localStorage.setItem('abasto-device-session', JSON.stringify(userEncontrado));
                    logEvent('AUTH', 'LOGIN', `${userEncontrado.nombre} inicio sesion`, userEncontrado);
                    return true;
                }

                // Failed attempt — increment counter and possibly lock out
                const newFailedAttempts = get().failedAttempts + 1;
                if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
                    const lockoutUntilTs = Date.now() + LOCKOUT_DURATION_MS;
                    set({ failedAttempts: newFailedAttempts, lockoutUntil: lockoutUntilTs });
                    logEvent('AUTH', 'LOCKOUT', `Cuenta bloqueada por ${LOCKOUT_DURATION_MS / 1000}s tras ${newFailedAttempts} intentos fallidos`);
                    const remainingSec = Math.ceil(LOCKOUT_DURATION_MS / 1000);
                    return { locked: true, remainingSec };
                } else {
                    set({ failedAttempts: newFailedAttempts });
                }

                return false;
            },

            logout: () => {
                const { usuarioActivo } = get();
                if (usuarioActivo) logEvent('AUTH', 'LOGOUT', `${usuarioActivo.nombre} cerro sesion`, usuarioActivo);
                set({ usuarioActivo: null });
                localStorage.removeItem('abasto-device-session');
            },

            cambiarPin: async (userId, nuevoPin) => {
                const nuevoPinHash = await hashPin(nuevoPin);
                set((state) => ({
                    usuarios: state.usuarios.map(u =>
                        u.id === userId ? { ...u, pin_hash: nuevoPinHash } : u
                    )
                }));

                // Si el usuario que cambió el PIN es el activo, actualizar su sesión local
                const { usuarioActivo } = get();
                if (usuarioActivo && usuarioActivo.id === userId) {
                    const nuevoActivo = { ...usuarioActivo, pin_hash: nuevoPinHash };
                    set({ usuarioActivo: nuevoActivo });
                    localStorage.setItem('abasto-device-session', JSON.stringify(nuevoActivo));
                }
                const target = get().usuarios.find(u => u.id === userId);
                logEvent('AUTH', 'PIN_CAMBIADO', `PIN cambiado para ${target?.nombre || 'usuario'}`, get().usuarioActivo);
            },

            agregarUsuario: async (nombre, rol, pin) => {
                const pinHash = await hashPin(pin);
                set((state) => {
                    const maxId = state.usuarios.reduce((max, u) => Math.max(max, u.id), 0);
                    return {
                        usuarios: [...state.usuarios, { id: maxId + 1, nombre, rol, pin_hash: pinHash }]
                    };
                });
                logEvent('USUARIO', 'USUARIO_CREADO', `Usuario "${nombre}" (${rol}) creado`, get().usuarioActivo);
            },

            eliminarUsuario: (userId) => {
                const { usuarios, usuarioActivo } = get();
                // No permitir eliminar al último ADMIN
                const admins = usuarios.filter(u => u.rol === 'ADMIN');
                const target = usuarios.find(u => u.id === userId);
                if (target?.rol === 'ADMIN' && admins.length <= 1) return false;
                // No permitir eliminarse a sí mismo
                if (usuarioActivo?.id === userId) return false;

                set({ usuarios: usuarios.filter(u => u.id !== userId) });
                logEvent('USUARIO', 'USUARIO_ELIMINADO', `Usuario "${target.nombre}" (${target.rol}) eliminado`, usuarioActivo);
                return true;
            },

            editarUsuario: (userId, datos) => {
                set((state) => ({
                    usuarios: state.usuarios.map(u =>
                        u.id === userId ? { ...u, ...datos } : u
                    )
                }));
                const { usuarioActivo } = get();
                if (usuarioActivo && usuarioActivo.id === userId) {
                    const nuevoActivo = { ...usuarioActivo, ...datos };
                    set({ usuarioActivo: nuevoActivo });
                    localStorage.setItem('abasto-device-session', JSON.stringify(nuevoActivo));
                }
            },

            setRequireLogin: (val) => {
                set({ requireLogin: val });
                logEvent('CONFIG', 'LOGIN_REQUERIDO_MODIFICADO', `Login requerido establecido a ${val ? 'SI' : 'NO'}`);
            },
        }),
        {
            name: 'abasto-auth-storage', // Nombre para localStorage
            partialize: (state) => ({
                usuarios: state.usuarios,
                requireLogin: state.requireLogin,
            }),
            storage: {
                getItem: (name) => {
                    const str = localStorage.getItem(name);
                    if (!str) return null;
                    try { return JSON.parse(str); } catch (e) { return null; }
                },
                setItem: (name, value) => {
                    localStorage.setItem(name, JSON.stringify(value));
                    // Disparar a la nube para P2P (Lazy import para evitar ciclos)
                    import('../useCloudSync').then(({ pushCloudSync }) => {
                        pushCloudSync(name, value);
                    }).catch(err => console.warn('No se pudo inyectar Auth Cloud', err));
                },
                removeItem: (name) => localStorage.removeItem(name)
            }
        }
    )
);
