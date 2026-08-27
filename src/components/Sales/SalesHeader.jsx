import { RefreshCw, Keyboard, Lock } from 'lucide-react';
import Tooltip from '../Tooltip';
import { useAuthStore } from '../../hooks/store/authStore';

const formatBs = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * SalesHeader — versión compacta (port PLAN-CAJA-ESPACIO).
 * Ya no ocupa una franja propia con título: es un chip de tasa + botón de atajos
 * que vive en la MISMA fila que el buscador (ver SalesView). El panel de
 * configuración de tasa se abre como popover bajo el chip.
 */
export default function SalesHeader({
    effectiveRate,
    useAutoRate,
    setUseAutoRate,
    customRate,
    setCustomRate,
    showRateConfig,
    setShowRateConfig,
    setShowKeyboardHelp,
    triggerHaptic
}) {
    const role = useAuthStore(s => s.role);
    const userRole = (role || '').toUpperCase();
    const isLocked = userRole === 'CAJERO' || userRole === 'MESERO' || userRole === 'BARRA';

    const handleRateToggle = () => {
        if (isLocked) return;
        setShowRateConfig(!showRateConfig);
    };

    return (
        <div className="relative shrink-0 flex flex-col gap-1.5 w-[86px] sm:w-[100px]">
            {/* Chip de tasa (estilo Listo POS) */}
            <Tooltip text={isLocked ? "Solo los administradores pueden fijar la tasa" : (useAutoRate ? "Tasa oficial sincronizada (BCV)" : "Usando tasa manual fijada por ti")} position="bottom">
                <button
                    data-tour="bcv-rate-btn"
                    onClick={handleRateToggle}
                    disabled={isLocked}
                    className={`w-full h-full min-h-[52px] flex flex-col items-center justify-center gap-0.5 px-2 rounded-2xl sm:rounded-3xl border shadow-sm transition-all ${isLocked
                        ? 'bg-slate-100 border-slate-200 dark:bg-slate-800/60 dark:border-slate-800 cursor-not-allowed opacity-80'
                        : showRateConfig
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-700'
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700'
                        }`}
                >
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        {isLocked ? <Lock size={9} /> : <RefreshCw size={9} className={showRateConfig ? 'text-emerald-500' : ''} />}
                        BCV
                    </span>
                    <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 leading-none tabular-nums">
                        {formatBs(effectiveRate)}
                    </span>
                    {!useAutoRate && (
                        <span className="text-[8px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1 rounded font-bold leading-none">MAN</span>
                    )}
                </button>
            </Tooltip>

            {/* Atajos de teclado (solo desktop) */}
            <button
                onClick={() => setShowKeyboardHelp(true)}
                className="hidden md:flex items-center justify-center gap-1 min-h-[30px] px-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                title="Atajos de teclado"
            >
                <Keyboard size={12} /> Atajos
            </button>

            {/* Popover de configuración de tasa */}
            {showRateConfig && !isLocked && (
                <div
                    data-tour="bcv-rate-config"
                    className="absolute right-0 top-full mt-1.5 w-72 z-40 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-3 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500">Tasa de Cambio</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400">
                                {useAutoRate ? <span className="text-emerald-500">Auto BCV</span> : <span>Manual</span>}
                            </span>
                            <button onClick={() => { triggerHaptic && triggerHaptic(); setUseAutoRate(!useAutoRate); }}
                                className={`relative w-10 h-6 rounded-full transition-colors ${useAutoRate ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${useAutoRate ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                    {!useAutoRate && (
                        <input type="number" value={customRate} onChange={e => setCustomRate(e.target.value)}
                            className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm font-bold text-indigo-600 dark:text-indigo-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="Ingresa Tasa Manual (Bs por $)" autoFocus />
                    )}
                    <button
                        onClick={() => { triggerHaptic && triggerHaptic(); setShowRateConfig(false); }}
                        className="w-full mt-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl shadow-sm shadow-emerald-500/20 active:scale-95 transition-all"
                    >
                        Aceptar
                    </button>
                </div>
            )}
        </div>
    );
}
