import React, { useState } from 'react';
import { X, Receipt, Zap, ArrowLeftRight, AlertTriangle, Clock, Coffee, Layers, Users } from 'lucide-react';
import { formatBs } from '../../utils/calculatorUtils';
import { PAYMENT_ICONS, ICON_COMPONENTS } from '../../config/paymentMethods';
import { mulR, subR, divR } from '../../utils/dinero';
import { useCheckoutPayments, EPSILON } from '../../hooks/useCheckoutPayments';
import CustomerPickerSection from './CustomerPickerSection';
import SpotlightTour from '../SpotlightTour';

const CHECKOUT_TOUR_KEY = 'pda_checkout_tour_done';

const CHECKOUT_STEPS = [
    {
        target: '[data-tour="checkout-total"]',
        title: 'Total a Pagar',
        text: 'Este es el monto total de la venta en USD y en Bs, calculado con la tasa del día.'
    },
    {
        target: '[data-tour="checkout-usd"]',
        title: 'Pago en Dólares ($)',
        text: 'Ingresa el monto que el cliente paga en efectivo USD. Toca "Total" para rellenar el monto exacto.'
    },
    {
        target: '[data-tour="checkout-bs"]',
        title: 'Pago en Bolívares (Bs)',
        text: 'Puedes combinar métodos: efectivo Bs, pago móvil, punto de venta. El sistema descuenta del total automáticamente.'
    },
    {
        target: '[data-tour="checkout-remaining"]',
        title: 'Resta / Vuelto',
        text: 'En naranja = falta por cobrar. En verde = hay vuelto. Al llenarse con exactitud, el botón se activa.'
    },
    {
        target: '[data-tour="checkout-confirm"]',
        title: 'Confirmar Venta',
        text: 'Una vez cubierto el total, este botón se activa. Si hay vuelto, puedes desglosarlo en $ y Bs antes de confirmar.'
    },
];

// ── Estilos de barra por moneda ──
const sectionStyles = {
    USD: {
        bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
        border: 'border-emerald-100 dark:border-emerald-900/50',
        title: 'text-emerald-800 dark:text-emerald-300',
        titleBg: 'bg-emerald-100 dark:bg-emerald-900/50',
        titleIcon: 'text-emerald-600 dark:text-emerald-400',
        inputBorder: 'border-emerald-200 dark:border-emerald-800 focus:border-emerald-500 focus:ring-emerald-500/20',
        inputActive: 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
        btnBg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 active:bg-emerald-300',
    },
    BS: {
        bg: 'bg-blue-50/50 dark:bg-blue-950/20',
        border: 'border-blue-100 dark:border-blue-900/50',
        title: 'text-blue-800 dark:text-blue-300',
        titleBg: 'bg-blue-100 dark:bg-blue-900/50',
        titleIcon: 'text-blue-600 dark:text-blue-400',
        inputBorder: 'border-blue-200 dark:border-blue-800 focus:border-blue-500 focus:ring-blue-500/20',
        inputActive: 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30',
        btnBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 active:bg-blue-300',
    },
    COP: {
        bg: 'bg-amber-50/50 dark:bg-amber-950/20',
        border: 'border-amber-100 dark:border-amber-900/50',
        title: 'text-amber-800 dark:text-amber-300',
        titleBg: 'bg-amber-100 dark:bg-amber-900/50',
        titleIcon: 'text-amber-600 dark:text-amber-400',
        inputBorder: 'border-amber-200 dark:border-amber-800 focus:border-amber-500 focus:ring-amber-500/20',
        inputActive: 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30',
        btnBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 active:bg-amber-300',
    },
};

/**
 * CheckoutModal — Zona de Cobro con Barras de Pago (Estilo Pool Los Diaz)
 * Cada método de pago tiene su propia barra con input + botón TOTAL.
 */
export default function CheckoutModal({
    onClose,
    cartSubtotalUsd,
    cartSubtotalBs,
    cartTotalUsd,
    cartTotalBs,
    discountData,
    effectiveRate,
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    paymentMethods,
    onConfirmSale,
    onUseSaldoFavor,
    triggerHaptic,
    onCreateCustomer,
    copEnabled,
    tasaCop,
    currentFloatUsd = 0,
    currentFloatBs = 0,
    tableContext = null,
    releaseTableOnCheckout = true,
    setReleaseTableOnCheckout = null,
}) {
    const {
        barValues, totalPaidUsd,
        remainingUsd, remainingBs, changeUsd, changeBs,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        changeBsGiven, setChangeBsGiven,
        confirmFiar, setConfirmFiar,
        overpayAlertData, setOverpayAlertData, confirmOverpay,
    } = useCheckoutPayments({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, cartTotalBs, onConfirmSale, triggerHaptic });

    const [showCheckoutTour, setShowCheckoutTour] = useState(
        () => localStorage.getItem(CHECKOUT_TOUR_KEY) !== 'true'
    );
    const [splitPeople, setSplitPeople] = useState(null);
    const [splitCustomInput, setSplitCustomInput] = useState('');
    const [splitPaid, setSplitPaid] = useState(0);

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const methodsUsd = paymentMethods.filter(m => m.currency === 'USD');
    const methodsBs = paymentMethods.filter(m => m.currency === 'BS');
    const methodsCop = paymentMethods.filter(m => m.currency === 'COP');

    const renderPaymentBar = (method, styles) => {
        const val = barValues[method.id] || '';
        const hasValue = parseFloat(val) > 0;
        const equivUsd = method.currency === 'BS' && hasValue
            ? (parseFloat(val) / effectiveRate).toFixed(2)
            : method.currency === 'COP' && hasValue && tasaCop
            ? (parseFloat(val) / tasaCop).toFixed(2)
            : null;

        return (
            <div key={method.id} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2 mb-1 ml-0.5">
                    {(() => { const MIcon = method.Icon || PAYMENT_ICONS[method.id] || ICON_COMPONENTS[method.icon]; return MIcon ? <MIcon size={16} className={hasValue ? '' : 'text-slate-400'} /> : <span className="text-base">{method.icon}</span>; })()}
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${hasValue ? styles.title : 'text-slate-400 dark:text-slate-500'}`}>
                        {method.label}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={val}
                            onChange={e => handleBarChange(method.id, e.target.value)}
                            placeholder="0.00"
                            className={`w-full py-3 px-4 pr-14 rounded-xl border-2 text-lg font-bold outline-none transition-all ${hasValue
                                ? styles.inputActive
                                : `bg-white dark:bg-slate-900 ${styles.inputBorder}`
                                } text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:ring-4`}
                        />
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2 py-0.5 rounded-md border ${hasValue
                            ? `${styles.titleBg} ${styles.title} ${styles.border}`
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}>
                            {method.currency === 'USD' ? '$' : method.currency === 'COP' ? 'COP' : 'Bs'}
                        </span>
                    </div>
                    <button
                        onClick={() => fillBar(method.id, method.currency)}
                        className={`shrink-0 py-3 px-3.5 rounded-xl font-black text-xs transition-all active:scale-95 flex items-center gap-1 ${styles.btnBg}`}
                    >
                        <Zap size={14} fill="currentColor" /> Total
                    </button>
                </div>
                {equivUsd && (
                    <p className="text-[11px] font-bold text-blue-500 dark:text-blue-400 mt-1 ml-1">≈ ${equivUsd}</p>
                )}
            </div>
        );
    };

    return (
        <>
        {showCheckoutTour && (
            <SpotlightTour
                steps={CHECKOUT_STEPS}
                onComplete={() => { localStorage.setItem(CHECKOUT_TOUR_KEY, 'true'); setShowCheckoutTour(false); }}
                onSkip={() => { localStorage.setItem(CHECKOUT_TOUR_KEY, 'true'); setShowCheckoutTour(false); }}
            />
        )}
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col overflow-hidden">

            {/* --- HEADER --- */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <button onClick={onClose} className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X size={22} />
                </button>
                <h2 className="text-base font-black text-slate-800 dark:text-white tracking-wide">COBRAR</h2>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 rounded-lg">
                    {formatBs(effectiveRate)} Bs/$
                </span>
            </div>

            {/* --- SCROLLABLE BODY --- */}
            <div className="flex-1 overflow-y-auto overscroll-contain pb-28">

                {/* -- MESA BREAKDOWN -- */}
                {tableContext && (
                    <div className="mx-3 mb-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-orange-100 dark:border-orange-800/30 bg-orange-100/50 dark:bg-orange-900/20">
                            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
                                <Layers size={13} className="text-white" />
                            </div>
                            <p className="text-xs font-black text-orange-700 dark:text-orange-400">{tableContext.table.name}</p>
                        </div>
                        <div className="divide-y divide-orange-100 dark:divide-orange-800/20">
                            {tableContext.timeCost > 0 && (
                                <div className="flex items-center justify-between px-3 py-2">
                                    {tableContext.session?.game_mode === 'PINA' ? (() => {
                                        const count = 1 + (Number(tableContext.session?.extended_times) || 0);
                                        return (
                                            <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                                🎱 {count} piña{count !== 1 ? 's' : ''}
                                            </span>
                                        );
                                    })() : (() => {
                                        const mins = tableContext.elapsed || 0;
                                        const timeLabel = mins < 60
                                            ? `${Math.ceil(mins)} min`
                                            : `${(mins / 60).toFixed(1).replace('.0', '')}h`;
                                        return (
                                            <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <Clock size={11} className="text-blue-400" /> Tiempo de juego · {timeLabel}
                                            </span>
                                        );
                                    })()}
                                    <span className="text-xs font-black text-slate-700 dark:text-white">${tableContext.timeCost.toFixed(2)}</span>
                                </div>
                            )}
                            {tableContext.currentItems?.map((item, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-1.5">
                                    <span className="flex items-center gap-1.5 text-xs text-slate-500 truncate pr-2">
                                        <Coffee size={11} className="text-amber-400 shrink-0" />
                                        <span className="font-bold text-slate-600">{item.qty}x</span> {item.product_name || item.name}
                                    </span>
                                    <span className="text-xs font-black text-slate-700 dark:text-white shrink-0">${(Number(item.unit_price_usd) * Number(item.qty)).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* -- TOGGLE: Liberar mesa al cobrar -- */}
                {tableContext && setReleaseTableOnCheckout && (
                    <div className="mx-3 mb-3 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-3 py-2.5">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Liberar mesa al cobrar</span>
                            <span className="text-[10px] text-slate-400">{releaseTableOnCheckout ? 'La mesa quedará libre al confirmar' : 'La mesa seguirá ocupada'}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReleaseTableOnCheckout(v => !v)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${releaseTableOnCheckout ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${releaseTableOnCheckout ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                )}

                {/* -- TOTAL BIMONEDA -- */}
                <div data-tour="checkout-total" className="px-4 py-4 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
                    {discountData?.active && (
                        <div className="flex flex-col items-center justify-center space-y-1 mb-3 pb-3 border-b border-slate-200/50 dark:border-slate-800/50">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                                <span>Subtotal:</span>
                                <span>${cartSubtotalUsd.toFixed(2)}</span>
                                <span className="text-[10px]">&bull;</span>
                                <span className="text-xs">Bs {formatBs(cartSubtotalBs)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm font-black text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-lg">
                                <span>Descuento ({discountData.type === 'percentage' ? `${discountData.value}%` : 'Fijo'}):</span>
                                <span>-${discountData.amountUsd.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                    <p className={`text-[11px] font-bold uppercase tracking-widest text-center mb-1 ${discountData?.active ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {discountData?.active ? 'Total Final' : 'Total a Pagar'}
                    </p>
                    <div className="text-center">
                        <span className={`text-4xl sm:text-5xl font-black ${discountData?.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            ${cartTotalUsd.toFixed(2)}
                        </span>
                        <span className="block text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                            Bs {formatBs(cartTotalBs)}
                        </span>
                        {copEnabled && (
                            <span className="block text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                COP {(cartTotalUsd * (tasaCop || 0)).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        )}
                    </div>
                </div>

                {/* -- DIVIDIR CUENTA -- */}
                <div className="mx-3 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                        <Users size={11} /> Dividir cuenta
                    </p>
                    {/* Botones rápidos + campo libre */}
                    <div className="flex gap-1.5 flex-wrap items-center">
                        {[2, 3, 4, 5, 6, 8].map(n => (
                            <button
                                key={n}
                                onClick={() => { setSplitPeople(n); setSplitCustomInput(''); setSplitPaid(0); }}
                                className={`w-9 h-9 rounded-xl text-xs font-black transition-all border ${
                                    splitPeople === n
                                        ? 'bg-violet-500 text-white border-violet-500 shadow-md shadow-violet-500/30'
                                        : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                        {/* Campo personalizado */}
                        <div className="flex items-center gap-1 ml-1">
                            <input
                                type="number"
                                min="2"
                                max="99"
                                placeholder="?"
                                value={splitCustomInput}
                                onChange={e => {
                                    const v = e.target.value;
                                    setSplitCustomInput(v);
                                    const n = parseInt(v);
                                    if (n >= 2) { setSplitPeople(n); setSplitPaid(0); }
                                }}
                                className="w-12 h-9 rounded-xl text-xs font-black text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-violet-400"
                            />
                        </div>
                        {splitPeople && (
                            <button
                                onClick={() => { setSplitPeople(null); setSplitCustomInput(''); setSplitPaid(0); }}
                                className="ml-auto text-[10px] text-slate-400 hover:text-red-400 transition-colors font-bold"
                            >
                                Quitar
                            </button>
                        )}
                    </div>

                    {/* Resultado + tracker */}
                    {splitPeople && cartTotalUsd > 0 && (
                        <div className="mt-2.5 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-xl">

                            {/* BANNER: Cobrar persona actual */}
                            {splitPaid < splitPeople ? (
                                <div className="mb-3">
                                    <div className="p-3 bg-violet-500 rounded-t-xl text-white flex items-center justify-between shadow-md shadow-violet-500/30">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Cobrar ahora</p>
                                            <p className="text-[11px] font-bold opacity-90">Persona {splitPaid + 1} de {splitPeople}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-black leading-none">${(cartTotalUsd / splitPeople).toFixed(2)}</p>
                                            <p className="text-xs font-bold opacity-80 mt-0.5">Bs {formatBs(cartTotalBs / splitPeople)}</p>
                                        </div>
                                    </div>
                                    {/* Botones auto-rellenar */}
                                    <div className="flex gap-1.5 p-2 bg-violet-400/20 dark:bg-violet-900/30 rounded-b-xl border-x border-b border-violet-200 dark:border-violet-700/40 flex-wrap">
                                        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest self-center mr-1 shrink-0">Llenar:</p>
                                        {methodsUsd.map(m => (
                                            <button key={m.id} onClick={() => {
                                                const prev = parseFloat(barValues[m.id] || '0') || 0;
                                                handleBarChange(m.id, (prev + cartTotalUsd / splitPeople).toFixed(2));
                                            }}
                                                className="flex-1 py-1.5 rounded-lg text-[11px] font-black bg-violet-500 text-white hover:bg-violet-600 active:scale-95 transition-all shadow-sm min-w-[80px]">
                                                $ {m.label}
                                            </button>
                                        ))}
                                        {methodsBs.map(m => (
                                            <button key={m.id} onClick={() => {
                                                const prev = parseFloat(barValues[m.id] || '0') || 0;
                                                handleBarChange(m.id, (prev + cartTotalBs / splitPeople).toFixed(2));
                                            }}
                                                className="flex-1 py-1.5 rounded-lg text-[11px] font-black bg-violet-400 text-white hover:bg-violet-500 active:scale-95 transition-all shadow-sm min-w-[80px]">
                                                Bs {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-3 p-3 bg-emerald-500 rounded-xl text-white flex items-center justify-center gap-2 shadow-md shadow-emerald-500/30">
                                    <span className="text-lg">✓</span>
                                    <p className="text-sm font-black">¡Cuenta completa! Todas las personas pagaron</p>
                                </div>
                            )}

                            {/* Tracker de cobro */}
                            <div className="border-t border-violet-200 dark:border-violet-700/40 pt-2.5">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">Cobradas</p>
                                    <p className="text-[10px] font-bold text-violet-500">
                                        {remainingUsd > 0.001
                                            ? `Falta: $${remainingUsd.toFixed(2)}`
                                            : '¡Cuenta completa!'}
                                    </p>
                                </div>
                                {/* Barra de progreso */}
                                <div className="w-full h-2 bg-violet-200 dark:bg-violet-800/40 rounded-full mb-2.5 overflow-hidden">
                                    <div
                                        className="h-full bg-violet-500 rounded-full transition-all duration-300"
                                        style={{ width: `${(splitPaid / splitPeople) * 100}%` }}
                                    />
                                </div>
                                {/* Círculos por persona */}
                                <div className="flex gap-1.5 flex-wrap mb-2.5">
                                    {Array.from({ length: splitPeople }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSplitPaid(i < splitPaid ? i : i + 1)}
                                            className={`w-7 h-7 rounded-full text-[10px] font-black border-2 transition-all ${
                                                i < splitPaid
                                                    ? 'bg-violet-500 border-violet-500 text-white'
                                                    : 'bg-white dark:bg-slate-800 border-violet-300 dark:border-violet-600 text-violet-400'
                                            }`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                {/* Botones + / - */}
                                <div className="flex gap-2">
                                    <button
                                        disabled={splitPaid <= 0}
                                        onClick={() => setSplitPaid(p => Math.max(0, p - 1))}
                                        className="flex-1 py-1.5 rounded-xl text-xs font-black border border-violet-300 dark:border-violet-600 text-violet-500 disabled:opacity-30 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-all"
                                    >
                                        − Quitar
                                    </button>
                                    <button
                                        disabled={splitPaid >= splitPeople}
                                        onClick={() => setSplitPaid(p => Math.min(splitPeople, p + 1))}
                                        className="flex-1 py-1.5 rounded-xl text-xs font-black bg-violet-500 text-white disabled:opacity-30 hover:bg-violet-600 transition-all shadow-sm shadow-violet-500/30"
                                    >
                                        + Cobrado
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* -- SECCIÓN DÓLARES ($) -- */}
                {methodsUsd.length > 0 && (
                    <div data-tour="checkout-usd" className={`mx-3 mb-3 rounded-2xl border ${sectionStyles.USD.bg} ${sectionStyles.USD.border} p-3`}>
                        <h3 className={`text-[11px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 ${sectionStyles.USD.title}`}>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-[11px] font-black shrink-0">$</span>
                            Dólares ($)
                        </h3>
                        {methodsUsd.map(m => renderPaymentBar(m, sectionStyles.USD))}
                    </div>
                )}

                {/* -- SECCIÓN BOLÍVARES (Bs) -- */}
                {methodsBs.length > 0 && (
                    <div data-tour="checkout-bs" className={`mx-3 mb-3 rounded-2xl border ${sectionStyles.BS.bg} ${sectionStyles.BS.border} p-3`}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${sectionStyles.BS.title}`}>
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] font-black italic shrink-0">Bs</span>
                                Bolívares (Bs)
                            </h3>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${sectionStyles.BS.titleBg} ${sectionStyles.BS.title}`}>
                                Tasa: {formatBs(effectiveRate)}
                            </span>
                        </div>
                        {methodsBs.map(m => renderPaymentBar(m, sectionStyles.BS))}
                    </div>
                )}

                {/* -- SECCIÓN PESOS (COP) -- */}
                {copEnabled && methodsCop.length > 0 && (
                    <div className={`mx-3 mb-3 rounded-2xl border ${sectionStyles.COP.bg} ${sectionStyles.COP.border} p-3`}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${sectionStyles.COP.title}`}>
                                <span className={`p-1 rounded-lg ${sectionStyles.COP.titleBg}`}>🟡</span>
                                Pesos (COP)
                            </h3>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${sectionStyles.COP.titleBg} ${sectionStyles.COP.title}`}>
                                Tasa: {formatBs(tasaCop)}
                            </span>
                        </div>
                        {methodsCop.map(m => renderPaymentBar(m, sectionStyles.COP))}
                    </div>
                )}

                {/* -- BANNER VUELTO / RESTANTE -- */}
                <div data-tour="checkout-remaining" className="px-3 py-2">
                    <div className={`p-3.5 rounded-xl border-2 transition-all ${isPaid
                        ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                        : 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800'
                        }`}>
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isPaid ? 'text-emerald-500' : 'text-orange-500'}`}>
                            {isPaid ? 'Vuelto' : 'Resta por Cobrar'}
                        </p>
                        <div className="flex items-end justify-between md:flex-col md:items-start md:gap-0.5">
                            <span className={`text-2xl font-black ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                ${isPaid ? changeUsd.toFixed(2) : remainingUsd.toFixed(2)}
                            </span>
                            <div className="flex flex-col text-right md:text-left">
                                <span className={`text-sm font-bold ${isPaid ? 'text-emerald-500' : 'text-orange-500'}`}>
                                    Bs {formatBs(isPaid ? changeBs : remainingBs)}
                                </span>
                                {copEnabled && (
                                    <span className={`text-sm font-bold ${isPaid ? 'text-emerald-500' : 'text-orange-500'}`}>
                                        COP {isPaid ? (changeUsd * (tasaCop || 0)).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (remainingUsd * (tasaCop || 0)).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* DESGLOSE DE VUELTO */}
                        {isPaid && changeUsd >= EPSILON && (
                            <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800 space-y-2">
                                <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                    <ArrowLeftRight size={10} /> Desglosar vuelto
                                </p>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="number" inputMode="decimal" placeholder="0.00"
                                            value={changeUsdGiven}
                                            onChange={e => {
                                                const v = e.target.value;
                                                const usd = Math.min(Math.max(0, parseFloat(v) || 0), changeUsd);
                                                setChangeUsdGiven(v);
                                                setChangeBsGiven(Math.max(0, mulR(subR(changeUsd, usd), effectiveRate)).toFixed(0));
                                            }}
                                            className="w-full py-2 px-3 pr-10 rounded-lg border-2 border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-900 font-black text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1 py-0.5 rounded">USD</span>
                                    </div>
                                    <span className="text-slate-400 font-black text-xs shrink-0">+</span>
                                    <div className="relative flex-1">
                                        <input
                                            type="number" inputMode="decimal" placeholder="0"
                                            value={changeBsGiven}
                                            onChange={e => {
                                                const v = e.target.value;
                                                const bsTotal = mulR(changeUsd, effectiveRate);
                                                const bs = Math.min(Math.max(0, parseFloat(v) || 0), bsTotal);
                                                setChangeBsGiven(v);
                                                setChangeUsdGiven(Math.max(0, subR(changeUsd, divR(bs, effectiveRate))).toFixed(2));
                                            }}
                                            className="w-full py-2 px-3 pr-8 rounded-lg border-2 border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-900 font-black text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded">Bs</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setChangeUsdGiven(changeUsd.toFixed(2)); setChangeBsGiven('0'); }}
                                        className="flex-1 py-1.5 rounded-lg text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 active:scale-95 transition-all border border-emerald-200 dark:border-emerald-800">
                                        Todo $
                                    </button>
                                    <button onClick={() => { setChangeUsdGiven('0'); setChangeBsGiven(mulR(changeUsd, effectiveRate).toFixed(0)); }}
                                        className="flex-1 py-1.5 rounded-lg text-[9px] font-black bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 active:scale-95 transition-all border border-blue-200 dark:border-blue-800">
                                        Todo Bs
                                    </button>
                                </div>
                                {(parseFloat(changeUsdGiven) > currentFloatUsd + 0.05 || parseFloat(changeBsGiven) > currentFloatBs + 1) && (
                                    <div className="mt-2 p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 flex items-start gap-1.5">
                                        <AlertTriangle size={12} className="text-orange-500 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 leading-tight">
                                                Precaución: El vuelto excede el fondo de caja registrado.
                                            </p>
                                            <p className="text-[9px] font-medium text-orange-500 leading-tight mt-0.5">
                                                Fondo actual: <span className="font-bold ml-1">${currentFloatUsd.toFixed(2)}</span> y <span className="font-bold ml-1">Bs {formatBs(currentFloatBs)}</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* -- CLIENTE -- */}
                <CustomerPickerSection
                    customers={customers}
                    selectedCustomerId={selectedCustomerId}
                    setSelectedCustomerId={setSelectedCustomerId}
                    selectedCustomer={selectedCustomer}
                    effectiveRate={effectiveRate}
                    remainingUsd={remainingUsd}
                    onUseSaldoFavor={onUseSaldoFavor}
                    triggerHaptic={triggerHaptic}
                    onCreateCustomer={onCreateCustomer}
                    EPSILON={EPSILON}
                />
            </div>

            {/* --- BOTÓN CTA FIJO --- */}
            <div data-tour="checkout-confirm" className="shrink-0 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                    onClick={() => {
                        if (!isPaid && selectedCustomerId && remainingUsd >= EPSILON) {
                            triggerHaptic && triggerHaptic();
                            setConfirmFiar(true);
                        } else {
                            handleConfirm();
                        }
                    }}
                    disabled={!selectedCustomerId && remainingUsd >= EPSILON}
                    className={`w-full py-4 text-white font-black text-base rounded-2xl shadow-lg transition-all tracking-wide flex items-center justify-center gap-2 ${isPaid
                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25 active:scale-[0.98]'
                        : selectedCustomerId
                            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25 active:scale-[0.98]'
                            : 'bg-slate-300 dark:bg-slate-800 text-slate-500 shadow-none cursor-not-allowed'
                        }`}
                >
                    {isPaid ? (
                        <><Receipt size={18} /> CONFIRMAR VENTA</>
                    ) : selectedCustomerId ? (
                        <><Users size={18} /> FIAR RESTANTE (${remainingUsd.toFixed(2)})</>
                    ) : (
                        <><Receipt size={18} /> INGRESA LOS PAGOS</>
                    )}
                </button>
            </div>

            {/* --- MODAL CONFIRMACIÓN FIAR --- */}
            {confirmFiar && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setConfirmFiar(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center shrink-0">
                                <AlertTriangle size={24} className="text-amber-600 sm:w-7 sm:h-7" />
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white">Confirmar Fiado</h3>
                                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Revisa los detalles antes de continuar</p>
                            </div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4 sm:p-5 mb-5">
                            <div className="text-center mb-3">
                                <p className="text-[11px] sm:text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Monto a fiar</p>
                                <p className="text-3xl sm:text-4xl font-black text-amber-600">${remainingUsd.toFixed(2)}</p>
                                <p className="text-sm sm:text-base font-bold text-amber-500/70 mt-0.5">{formatBs(remainingBs)} Bs</p>
                            </div>
                            <div className="border-t border-amber-200/50 dark:border-amber-800/20 pt-3 space-y-2">
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                                    Se registrara como deuda a nombre de <span className="font-black text-slate-800 dark:text-white">{selectedCustomer?.name}</span>.
                                </p>
                                {totalPaidUsd > EPSILON && (
                                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                        El cliente abona <span className="font-bold text-emerald-600">${totalPaidUsd.toFixed(2)}</span> ahora y el restante queda pendiente.
                                    </p>
                                )}
                                {totalPaidUsd <= EPSILON && (
                                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                        El monto total de la venta quedara como deuda del cliente.
                                    </p>
                                )}
                                {selectedCustomer && (selectedCustomer.deuda || 0) > EPSILON && (
                                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg p-2.5 mt-2">
                                        <p className="text-[11px] sm:text-xs font-bold text-red-600 dark:text-red-400">
                                            Este cliente ya tiene una deuda de ${(selectedCustomer.deuda || 0).toFixed(2)}. La deuda total pasara a ser ${((selectedCustomer.deuda || 0) + remainingUsd).toFixed(2)}.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmFiar(false)}
                                className="flex-1 py-3.5 sm:py-4 font-bold text-sm sm:text-base text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                Cancelar
                            </button>
                            <button onClick={() => { setConfirmFiar(false); handleConfirm(); }}
                                className="flex-1 py-3.5 sm:py-4 font-black text-sm sm:text-base text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all">
                                Confirmar fiado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL ALERTA PAGO SOSPECHOSO --- */}
            {overpayAlertData && (() => {
                const d = overpayAlertData;
                const isCurrency = d.type === 'currency';
                const isRound    = d.type === 'round';

                const title    = isCurrency ? '¿Te equivocaste de campo?' : isRound ? '¿Número por error?' : '¿Monto correcto?';
                const subtitle = isCurrency
                    ? `Parece que ingresaste bolívares en el campo de ${d.methodLabel}`
                    : isRound
                    ? 'El monto parece un número redondeado por error'
                    : `El pago es ${d.ratio}× el total de la compra`;

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setOverpayAlertData(null)}>
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-4 mb-5">
                                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center shrink-0">
                                    <AlertTriangle size={24} className="text-red-600 sm:w-7 sm:h-7" />
                                </div>
                                <div>
                                    <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white">{title}</h3>
                                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{subtitle}</p>
                                </div>
                            </div>

                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 sm:p-5 mb-5 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500 dark:text-slate-400">Total de la compra</span>
                                    <span className="text-base font-black text-slate-800 dark:text-white">${cartTotalUsd.toFixed(2)}</span>
                                </div>
                                {isCurrency && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">Total en Bs</span>
                                        <span className="text-base font-black text-slate-800 dark:text-white">{formatBs(d.expectedBs)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500 dark:text-slate-400">Monto ingresado</span>
                                    <span className="text-base font-black text-red-600">
                                        {isCurrency ? formatBs(d.enteredAmount) : `$${totalPaidUsd.toFixed(2)}`}
                                    </span>
                                </div>
                                <div className="border-t border-red-200/50 dark:border-red-800/20 pt-3">
                                    {isCurrency ? (
                                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                                            Ingresaste <span className="font-black text-red-600">{formatBs(d.enteredAmount)}</span> en el campo de dólares.
                                            El total en Bs sería <span className="font-black text-slate-800 dark:text-white">{formatBs(d.expectedBs)}</span>.
                                        </p>
                                    ) : isRound ? (
                                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                                            ¿Seguro que el cliente pagó <span className="font-black text-red-600">${totalPaidUsd.toFixed(2)}</span> por una compra de <span className="font-black text-slate-800 dark:text-white">${cartTotalUsd.toFixed(2)}</span>?
                                        </p>
                                    ) : (
                                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                                            ¿Seguro que el cliente pagó <span className="font-black text-red-600">${totalPaidUsd.toFixed(2)}</span> por una compra de <span className="font-black text-slate-800 dark:text-white">${cartTotalUsd.toFixed(2)}</span>?
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setOverpayAlertData(null)}
                                    className="flex-1 py-3.5 sm:py-4 font-bold text-sm sm:text-base text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                    Corregir monto
                                </button>
                                <button onClick={confirmOverpay}
                                    className="flex-1 py-3.5 sm:py-4 font-black text-sm sm:text-base text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-lg shadow-red-500/25 active:scale-95 transition-all">
                                    Sí, confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
        </>
    );
}
