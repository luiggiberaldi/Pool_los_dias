import React from 'react';
import { Package, CreditCard, ShieldCheck } from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import PaymentMethodsManager from '../PaymentMethodsManager';

export default function SettingsTabVentas({
    allowNegativeStock, setAllowNegativeStock,
    maxDiscountCajero, setMaxDiscountCajero,
    forceHeartbeat, showToast, triggerHaptic
}) {
    return (
        <>
            <SectionCard icon={Package} title="Inventario" subtitle="Reglas de ventas" iconColor="text-emerald-500">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Vender sin Stock</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Permitir ventas si el inventario es 0</p>
                    </div>
                    <Toggle
                        enabled={allowNegativeStock}
                        onChange={() => {
                            const newVal = !allowNegativeStock;
                            setAllowNegativeStock(newVal);
                            localStorage.setItem('allow_negative_stock', newVal.toString());
                            forceHeartbeat();
                            showToast(newVal ? 'Se permite vender sin stock' : 'No se permite vender sin stock', 'success');
                            triggerHaptic?.();
                        }}
                    />
                </div>
            </SectionCard>

            <SectionCard icon={ShieldCheck} title="Seguridad de Descuentos" subtitle="Control de descuentos por rol" iconColor="text-violet-500">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Límite de descuento para cajeros</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Descuentos mayores requieren PIN de admin. Pon 100 para sin límite.</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={maxDiscountCajero}
                            onChange={e => {
                                const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                setMaxDiscountCajero(val);
                                localStorage.setItem('max_discount_cajero', String(val));
                                triggerHaptic?.();
                            }}
                            className="w-16 text-center text-sm font-black text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <span className="text-sm font-bold text-slate-500">%</span>
                    </div>
                </div>
            </SectionCard>

            <SectionCard icon={CreditCard} title="Metodos de Pago" subtitle="Configura como te pagan" iconColor="text-blue-500">
                <PaymentMethodsManager triggerHaptic={triggerHaptic} />
            </SectionCard>
        </>
    );
}

