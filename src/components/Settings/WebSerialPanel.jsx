import React, { useState, useEffect } from 'react';
import {
    Printer, Usb, AlertTriangle, CheckCircle, RefreshCw,
    SmartphoneNfc, Scan, RotateCcw, Wifi
} from 'lucide-react';
import { SectionCard, Toggle } from '../SettingsShared';
import {
    detectAndAutoConfig, getConnectedPrinter, openCashDrawerWebSerial,
    printTestWebSerial, getWebSerialConfig, saveWebSerialConfig, clearPrinterConfig
} from '../../services/webSerialPrinter';
import { TYPE_LABELS } from '../../services/printerDatabase';
import { showToast } from '../Toast';

// ── Íconos por tipo ───────────────────────────────────────────────────────────
const TYPE_ICON = {
    thermal:        Usb,
    thermal_serial: Usb,
    system:         Printer,
};

// ── Colores por tipo ──────────────────────────────────────────────────────────
const TYPE_COLOR = {
    thermal:        'emerald',
    thermal_serial: 'emerald',
    system:         'indigo',
};

function PrinterChip({ brand, model, type }) {
    const color = TYPE_COLOR[type] || 'slate';
    const Icon  = TYPE_ICON[type] || Printer;
    const label = TYPE_LABELS[type]?.label || type;

    const colorMap = {
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
        indigo:  'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40',
        slate:   'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    };

    return (
        <div className={`flex items-center gap-2.5 p-3 rounded-xl border ${colorMap[color]}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
                ${color === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-900/40' :
                  color === 'indigo'  ? 'bg-indigo-100 dark:bg-indigo-900/40' :
                                        'bg-slate-100 dark:bg-slate-800'}`}>
                <Icon size={18} />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-black truncate">{brand} <span className="font-medium opacity-80">{model}</span></p>
                <p className="text-[10px] font-medium opacity-70 mt-0.5">{label}</p>
            </div>
            <CheckCircle size={16} className="ml-auto shrink-0 opacity-70" />
        </div>
    );
}

export default function WebSerialPanel() {
    const [config, setConfig]     = useState(getWebSerialConfig());
    const [connected, setConnected] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [testing, setTesting]   = useState(false);
    const [error, setError]       = useState('');

    const isConfigured = !!config.printerType;
    const isThermal    = config.printerType === 'thermal' || config.printerType === 'thermal_serial';
    const isSystem     = config.printerType === 'system';
    const isSupported  = 'serial' in navigator;

    // Verificar si ya hay un puerto conectado al montar
    useEffect(() => {
        getConnectedPrinter().then(port => setConnected(!!port));
        setConfig(getWebSerialConfig());
    }, []);

    // ── Detectar impresora ──────────────────────────────────────────────────
    const handleDetect = async () => {
        setDetecting(true);
        setError('');
        try {
            const detected = await detectAndAutoConfig();
            setConfig(detected);

            // Para térmicas: marcar como conectada
            if (detected.printerType !== 'system') setConnected(true);

            showToast(`Detectado: ${detected.printerBrand} ${detected.printerModel}`, 'success');
        } catch (err) {
            if (!err.message.includes('Cancelaste')) {
                setError(err.message);
            }
        } finally {
            setDetecting(false);
        }
    };

    // ── Resetear configuración ─────────────────────────────────────────────
    const handleReset = () => {
        clearPrinterConfig();
        setConfig(getWebSerialConfig());
        setConnected(false);
        setError('');
        showToast('Configuración de impresora eliminada', 'success');
    };

    // ── Test de impresión ──────────────────────────────────────────────────
    const handleTestPrint = async () => {
        setTesting(true);
        setError('');
        try {
            if (isSystem) {
                // Abrir diálogo de impresión del sistema
                window.print();
                showToast('Diálogo de impresión abierto', 'success');
            } else {
                await printTestWebSerial();
                showToast('Ticket enviado a la impresora', 'success');
            }
        } catch (err) {
            setError(err.message);
            showToast('Error al imprimir', 'error');
        } finally {
            setTesting(false);
        }
    };

    // ── Abrir cajón ────────────────────────────────────────────────────────
    const handleOpenDrawer = async () => {
        setTesting(true);
        setError('');
        try {
            await openCashDrawerWebSerial();
            showToast('Cajón abriendo', 'success');
        } catch (err) {
            setError(err.message);
            showToast('Error al abrir cajón', 'error');
        } finally {
            setTesting(false);
        }
    };

    // ── Baud rate manual (override) ────────────────────────────────────────
    const handleBaudRate = (baud) => {
        const newCfg = { ...config, baudRate: Number(baud) };
        setConfig(newCfg);
        saveWebSerialConfig(newCfg);
    };

    // ── Apertura automática ────────────────────────────────────────────────
    const toggleAutoOpen = () => {
        const newCfg = { ...config, autoOpenDrawer: !config.autoOpenDrawer };
        setConfig(newCfg);
        saveWebSerialConfig(newCfg);
    };

    // ── Render ─────────────────────────────────────────────────────────────
    if (!isSupported) {
        return (
            <SectionCard icon={Printer} title="Impresora" subtitle="Detección automática" iconColor="text-indigo-500">
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-start gap-3 border border-red-200 dark:border-red-800/40">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-bold mb-1">Navegador No Soportado</p>
                        <p className="text-xs opacity-90 leading-relaxed">
                            Usá Chrome, Edge o un navegador Chromium en Windows/Mac/Android.
                        </p>
                    </div>
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard icon={Printer} title="Impresora" subtitle="Detección automática" iconColor="text-indigo-500">
            <div className="space-y-4">

                {/* ── Estado / Chip de impresora ── */}
                {isConfigured ? (
                    <PrinterChip
                        brand={config.printerBrand}
                        model={config.printerModel}
                        type={config.printerType}
                    />
                ) : (
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
                        <Printer size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Sin impresora configurada</p>
                        <p className="text-[10px] text-slate-400 mt-1">Conectá la impresora por USB y pulsá Detectar</p>
                    </div>
                )}

                {/* ── Nota si es impresora del sistema ── */}
                {isSystem && (
                    <div className="flex items-start gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800/40">
                        <Wifi size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                            Esta impresora usa el diálogo estándar del sistema. Funciona con cualquier impresora instalada en Windows/Mac.
                        </p>
                    </div>
                )}

                {/* ── Errores ── */}
                {error && (
                    <p className="text-xs text-red-500 dark:text-red-400 font-medium flex items-center gap-1.5 px-1">
                        <AlertTriangle size={12} /> {error}
                    </p>
                )}

                {/* ── Botón principal: Detectar / Reconfigurar ── */}
                <button
                    onClick={handleDetect}
                    disabled={detecting}
                    className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60
                        bg-indigo-500 hover:bg-indigo-600 text-white"
                >
                    {detecting
                        ? <><RefreshCw size={15} className="animate-spin" /> Detectando...</>
                        : <><Scan size={15} /> {isConfigured ? 'Volver a detectar' : 'Detectar impresora'}</>
                    }
                </button>

                {/* ── Acciones (solo si está configurada) ── */}
                {isConfigured && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">

                        {/* Baud rate (solo para térmicas) */}
                        {isThermal && (
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Velocidad (Baud Rate)</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Auto-detectado · ajustá si no imprime</p>
                                </div>
                                <select
                                    value={config.baudRate || 9600}
                                    onChange={e => handleBaudRate(e.target.value)}
                                    className="text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                >
                                    <option value={9600}>9600</option>
                                    <option value={19200}>19200</option>
                                    <option value={38400}>38400</option>
                                    <option value={57600}>57600</option>
                                    <option value={115200}>115200</option>
                                </select>
                            </div>
                        )}

                        {/* Test de impresión */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Test de Impresión</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {isSystem ? 'Abre el diálogo del sistema' : 'Comando bruto ESC/POS'}
                                </p>
                            </div>
                            <button
                                onClick={handleTestPrint}
                                disabled={testing}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
                            >
                                {testing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Imprimir
                            </button>
                        </div>

                        {/* Cajón (solo para térmicas) */}
                        {isThermal && (
                            <>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Prueba de Cajón</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Enviar pulso 24v a la impresora</p>
                                    </div>
                                    <button
                                        onClick={handleOpenDrawer}
                                        disabled={testing}
                                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 disabled:opacity-50 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800"
                                    >
                                        <SmartphoneNfc size={14} /> Abrir
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Apertura Automática</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">Al cobrar una mesa</p>
                                    </div>
                                    <Toggle enabled={config.autoOpenDrawer} onChange={toggleAutoOpen} color="indigo" />
                                </div>
                            </>
                        )}

                        {/* Resetear */}
                        <button
                            onClick={handleReset}
                            className="w-full py-2 rounded-xl text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center gap-1.5 transition-colors"
                        >
                            <RotateCcw size={12} /> Eliminar configuración
                        </button>
                    </div>
                )}
            </div>
        </SectionCard>
    );
}
