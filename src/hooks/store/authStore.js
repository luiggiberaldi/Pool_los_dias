/**
 * authStore.js — Secure PIN Auth Store (SHA-256 + localforage)
 * 
 * API pública:
 *   isAuthenticated  — boolean
 *   role             — 'ADMIN' | 'CAJERO' | null
 *   currentUser      — objeto usuario activo completo
 *   cachedUsers      — lista de usuarios desde Supabase (para el login screen)
 *   login(userId, pin)  — verifica PIN con SHA-256 y activa sesión
 *   logout()            — limpia sesión activa
 *   syncUsers()         — baja usuarios desde Supabase y los guarda en localforage
 *
 * Aliases de compatibilidad (legacy):
 *   usuarioActivo    → currentUser
 *   usuarios         → cachedUsers
 *   nombre           → currentUser?.name
 *   rol              → role
 */

import { create } from 'zustand';
import { supabaseCloud } from '../../config/supabaseCloud';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function sha256(text) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// LocalForage lazy import para evitar problemas de SSR/hydration
async function getLocalForage() {
    const lf = await import('localforage');
    return lf.default;
}

const SESSION_KEY = 'poolbar_active_session';
const USERS_CACHE_KEY = 'poolbar_users_cache';

// ── Cargar sesión persistida al iniciar ──────────────────────────────────────

async function loadPersistedSession() {
    try {
        const lf = await getLocalForage();
        const session = await lf.getItem(SESSION_KEY);
        return session || null;
    } catch {
        return null;
    }
}

async function loadCachedUsers() {
    try {
        const lf = await getLocalForage();
        const users = await lf.getItem(USERS_CACHE_KEY);
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create((set, get) => ({
    // ── Estado ───────────────────────────────────────────────────────────────
    isAuthenticated: false,
    currentUser: null,
    role: null,
    cachedUsers: [],
    _hydrated: false,

    // ── Aliases legados (compatibilidad con componentes no migrados) ──────────
    get usuarioActivo() { return get().currentUser; },
    get usuarios()      { return get().cachedUsers; },
    get nombre()        { return get().currentUser?.name || null; },
    get rol()           { return get().role; },

    // ── Hidratación: carga sesión y caché al montar ───────────────────────────
    hydrate: async () => {
        if (get()._hydrated) return;
        const [session, users] = await Promise.all([loadPersistedSession(), loadCachedUsers()]);
        set({
            currentUser:     session,
            isAuthenticated: !!session,
            role:            session?.role || null,
            cachedUsers:     users,
            _hydrated:       true,
        });
    },

    // ── Sincronizar usuarios desde Supabase ───────────────────────────────────
    syncUsers: async () => {
        try {
            const { data, error } = await supabaseCloud
                .from('staff_users')
                .select('id, name, role, pin_hash, active')
                .eq('active', true)
                .order('role', { ascending: true });

            if (error) throw error;

            const users = data || [];
            const lf = await getLocalForage();
            await lf.setItem(USERS_CACHE_KEY, users);
            set({ cachedUsers: users });
            return users;
        } catch (err) {
            console.warn('[authStore] syncUsers error:', err);
            // Si falla la red, usamos el caché que ya tenemos
            return get().cachedUsers;
        }
    },

    // ── Login: verifica SHA-256 ────────────────────────────────────────────────
    login: async (userId, pin) => {
        await new Promise(r => setTimeout(r, 350)); // feedback visual mínimo

        const { cachedUsers } = get();
        const user = cachedUsers.find(u => u.id === userId);
        if (!user) return false;

        const hashedPin = await sha256(pin);
        if (hashedPin !== user.pin_hash) return false;

        const session = { ...user };

        try {
            const lf = await getLocalForage();
            await lf.setItem(SESSION_KEY, session);
        } catch { /* continúa aunque falle la persistencia */ }

        set({
            isAuthenticated: true,
            currentUser:     session,
            role:            session.role,
        });

        return true;
    },

    // ── Logout ────────────────────────────────────────────────────────────────
    logout: async () => {
        try {
            const lf = await getLocalForage();
            await lf.removeItem(SESSION_KEY);
        } catch { /* ignorar */ }

        set({
            isAuthenticated: false,
            currentUser:     null,
            role:            null,
        });
    },

    // ── Métodos legados (por compatibilidad con SettingsView / DashboardView) ──

    setRequireLogin: () => {},   // no-op: PIN siempre requerido
    setAdminCredentials: () => {}, // no-op: credenciales manejadas por Supabase Auth

    // ── Lock automático (lo llama useAutoLock) ────────────────────────────────
    lockSession: async () => {
        try {
            const lf = await getLocalForage();
            await lf.removeItem(SESSION_KEY);
        } catch { /* ignorar */ }

        set({
            isAuthenticated: false,
            currentUser:     null,
            role:            null,
        });
    },
}));

// ── Auto-hidratación al importar el módulo ────────────────────────────────────
useAuthStore.getState().hydrate();
