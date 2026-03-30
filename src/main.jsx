import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ResetPasswordView from './views/ResetPasswordView.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { supabaseCloud } from './config/supabaseCloud.js'
import './index.css'

// ── Evitar que la rueda del mouse cambie valores en inputs numéricos ──
document.addEventListener('wheel', (e) => {
  if (e.target?.type === 'number') {
    e.target.blur();
    e.preventDefault();
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  </React.StrictMode>,
)

