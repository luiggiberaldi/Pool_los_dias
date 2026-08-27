import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, X, Eye, EyeOff } from 'lucide-react';

export default function SuperAdminModal({ isOpen, onClose, onSuccess }) {
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setError(false);
            const timer = setTimeout(() => inputRef.current?.focus(), 100);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password || loading) return;
        setLoading(true);
        setError(false);
        const ok = await onSuccess(password);
        setLoading(false);
        if (!ok) {
            setError(true);
            setPassword('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5 border border-slate-100" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-sky-50 rounded-xl text-sky-500">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="font-bold text-slate-800 text-lg block leading-tight">Acceso Super Admin</span>
                            <span className="text-[11px] text-slate-400">Panel de emergencia maestro</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type={showPw ? 'text' : 'password'}
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(false); }}
                            placeholder="Contraseña maestra"
                            className={`w-full px-4 py-3 rounded-xl border-2 text-slate-800 outline-none transition-colors pr-11 text-sm font-medium
                                ${error ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-slate-200 focus:border-sky-500 bg-slate-50'}`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        >
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs font-semibold text-red-500 text-center -mt-1 animate-in shake">Contraseña incorrecta</p>
                    )}

                    <button
                        type="submit"
                        disabled={!password || loading}
                        className="w-full py-3 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-semibold rounded-xl shadow-md shadow-sky-500/25 transition-all active:scale-95 disabled:opacity-50 text-sm"
                    >
                        {loading ? 'Verificando...' : 'Entrar como Super Admin'}
                    </button>
                </form>
            </div>
        </div>
    );
}
