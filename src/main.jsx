import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ResetPasswordView from './views/ResetPasswordView.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { supabaseCloud } from './config/supabaseCloud.js'
import './index.css'

// ── Auto-actualización y limpieza segura de Service Worker/cache ──
const APP_CACHE_VERSION = 'pool-los-diaz-v20260827';
async function maintainPwaCache() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const currentRegistration = registrations.find(reg => reg.scope === `${window.location.origin}/`);
    if (currentRegistration) await currentRegistration.update().catch(() => {});
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => !name.includes(APP_CACHE_VERSION))
      .map(name => caches.delete(name)));
    if (currentRegistration?.active) currentRegistration.active.postMessage({ type: 'CLEAR_OLD_CACHES', version: APP_CACHE_VERSION });
  } catch (_) { /* cache maintenance is best effort */ }
}

if ('serviceWorker' in navigator) {
  // Cuando el nuevo SW toma control, recargar para cargar los assets nuevos.
  // Esto garantiza que el usuario siempre ejecuta la versión más reciente.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      await maintainPwaCache();
      const swUrl = new URL('/sw.js', window.location.origin);
      const response = await fetch(swUrl, { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('javascript')) {
        // En desarrollo Vite puede devolver index.html para /sw.js. No
        // registrar esa respuesta como service worker: evita el MIME error.
        console.warn('[PWA] Service worker omitido: /sw.js no devolvió JavaScript.');
        return;
      }
      const reg = await navigator.serviceWorker.register(swUrl.pathname, { scope: '/' });
      await maintainPwaCache();
      // Chequear actualizaciones cada 60 segundos
      setInterval(() => reg.update().catch(() => {}), 60 * 1000);
    } catch (_) { /* service worker registration is optional */ }
  });
}

/* eslint-disable react-refresh/only-export-components */

// ── Evitar que la rueda del mouse cambie valores en inputs numéricos ──
document.addEventListener('wheel', (e) => {
  if (e.target?.type === 'number' && document.activeElement === e.target) {
    e.preventDefault();  // Bloquear ANTES de que el browser cambie el valor
    e.target.blur();     // Luego quitar foco para que no siga capturando scroll
  }
}, { passive: false });

// Detectar token de recuperación en la URL al cargar (antes de React)
function detectRecovery() {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  return hash.includes('type=recovery') || params.has('code');
}

function AppRouter() {
  const [isRecovery, setIsRecovery] = useState(detectRecovery);

  useEffect(() => {
    const { data: { subscription } } = supabaseCloud.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isRecovery) {
    return (
      <ResetPasswordView
        onDone={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsRecovery(false);
        }}
      />
    );
  }

  return <App />;
}

import { ConfirmProvider } from './hooks/useConfirm.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <AppRouter />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
)

