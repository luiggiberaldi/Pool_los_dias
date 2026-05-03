import React from 'react';
import { ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { formatBs } from '../../utils/calculatorUtils';
import { mulR, subR, divR } from '../../utils/dinero';
import { EPSILON } from '../../hooks/useCheckoutPayments';

export default function CheckoutChangeBreakdown({
    isPaid, changeUsd, changeBs, remainingUsd, remainingBs,
    copEnabled, tasaCop,
    changeUsdGiven, setChangeUsdGiven,
    changeBsGiven, setChangeBsGiven,
    effectiveRate,
    currentFloatUsd, currentFloatBs,
}) {
    return (
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
    );
}
