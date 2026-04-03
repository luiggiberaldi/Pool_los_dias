import React, { useState, useEffect } from 'react';
import { Usb, AlertTriangle, CheckCircle, RefreshCw, SmartphoneNfc } from 'lucide-react';
import { SectionCard, Toggle } from '../SettingsShared';
import { requestPrinterPort, getConnectedPrinter, openCashDrawerWebSerial, printTestWebSerial, getWebSerialConfig, saveWebSerialConfig } from '../../services/webSerialPrinter';
import { showToast } from '../Toast';

export default function WebSerialPanel() {
    const [isConnected, setIsConnected] = useState(false);
    const [config, setConfig] = useState({ autoOpenDrawer: false });
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const checkPort = async () => {
            const port = await getConnectedPrinter();
            setIsConnected(!!port);
        };
        checkPort();
        setConfig(getWebSerialConfig());
    }, []);

    const handleConnect = async () => {
        try {
            setError('');
            await requestPrinterPort();
            setIsConnected(true);
            showToast('Impresora USB conectada', 'success');
        } catch (err) {
            setError(err.message || 'Error al conectar USB');
            setIsConnected(false);
        }
    };

    const handleTestPrint = async () => {
        setTesting(true);
        try {
            await printTestWebSerial();
            showToast('Ticket enviado', 'success');
        } catch (err) {
            setError(err.message);
        } finally {
            setTesting(false);
        }
    };

    const handleOpenDrawer = async () => {
        setTesting(true);
        try {
            await openCashDrawerWebSerial();
            showToast('Cajón abriendo', 'success');
        } catch (err) {
            setError(err.message);
        } finally {
            setTesting(false);
        }
    };

    const toggleAutoOpen = () => {
        const newVal = !config.autoOpenDrawer;
        const newCfg = { ...config, autoOpenDrawer: newVal };
        setConfig(newCfg);
        saveWebSerialConfig(newCfg);
    };

    const isSupported = 'serial' in navigator;

    return (
        <SectionCard icon={Usb} title="Impresora USB & Cajón" subtitle="Conexión nativa (Web Serial API)" iconColor="text-indigo-500">
            {!isSupported ? (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-start gap-3 border border-red-200 dark:border-red-800/40">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-bold mb-1">Navegador No Soportado</p>
                        <p className="text-xs opacity-90 leading-relaxed">
                            Web Serial API no está disponible en este navegador. Debes usar Chrome, Edge o un navegador basado en Chromium en Windows/Mac/Android.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Status Box */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${isConnected ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isConnected ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-500' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
                                <Usb size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-800 dark:text-white">
                                    {isConnected ? 'Dispositivo USB Listo' : 'No Conectado'}
                                </p>
                                <p className="text-[10px] text-slate-500 font-medium">
                                    {isConnected ? 'Permisos otorgados al navegador' : 'Requiere autorización'}
                                </p>
                            </div>
                        </div>

                        {!isConnected ? (
                            <button
                                onClick={handleConnect}
                                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white text-xs font-bold rounded-lg transition-all"
                            >
                                Conectar
                            </button>
                        ) : (
                            <span className="flex items-center gap-1 text-[10px] uppercase font-black tracking-wider text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-md">
                                <CheckCircle size={12} /> ON
                            </span>
                        )}
                    </div>

                    {error && (
                        <p className="text-xs text-red-500 dark:text-red-400 font-medium px-1 flex items-center gap-1.5">
                            <AlertTriangle size={12} /> {error}
                        </p>
                    )}

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Test de Impresión</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Comando bruto ESC/POS</p>
                            </div>
                            <button
                                onClick={handleTestPrint}
                                disabled={!isConnected || testing}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
                            >
                                {testing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} 
                                Imprimir
                            </button>
                        </div>
                        
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Prueba de Cajón</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Enviar pulso 24v a la impresora</p>
                            </div>
                            <button
                                onClick={handleOpenDrawer}
                                disabled={!isConnected || testing}
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
                            <Toggle
                                enabled={config.autoOpenDrawer}
                                onChange={toggleAutoOpen}
                                color="indigo"
                            />
                        </div>
                    </div>
                </div>
            )}
        </SectionCard>
    );
}
