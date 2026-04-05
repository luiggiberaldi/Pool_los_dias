import { useMemo } from 'react';
import { formatBs } from '../../utils/calculatorUtils';
import { getPaymentLabel, getPaymentMethod, PAYMENT_ICONS, toTitleCase, getPaymentIcon } from '../../config/paymentMethods';
import { generateTicketPDF } from '../../utils/ticketGenerator';
import { ChevronDown, ChevronUp, Send, Ban, Shuffle, Clock, Recycle, LockIcon } from 'lucide-react';

export default function TransactionRow({ sale: s, bcvRate, isExpanded, onToggle, onVoidSale, onRecycleSale }) {
    const d = new Date(s.timestamp);

    const { methodLabel, PayMethodIcon } = useMemo(() => {
        let label = 'Efectivo';
        let icon = PAYMENT_ICONS['efectivo_bs'];

        if (s.tipo === 'VENTA_FIADA') {
            label = 'Por Cobrar';
            icon = Clock;
        } else if (s.payments && s.payments.length === 1) {
            label = toTitleCase(s.payments[0].methodLabel);
            const m = getPaymentMethod(s.payments[0].methodId);
            if (m) icon = getPaymentIcon(m.id) || m.Icon || null;
        } else if (s.payments && s.payments.length > 1) {
            label = 'Pago Mixto';
            icon = Shuffle;
        } else if (s.paymentMethod) {
            const m = getPaymentMethod(s.paymentMethod);
            if (m) {
                label = toTitleCase(m.label);
                icon = getPaymentIcon(m.id) || m.Icon || null;
            }
        }

        return { methodLabel: label, PayMethodIcon: icon };
    }, [s.tipo, s.payments, s.paymentMethod]);

    const isCanceled = s.status === 'ANULADA';
    const dateLabel = d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });

    const handleShare = (e) => {
        e.stopPropagation();
        let text = `*COMPROBANTE | PRECIOS AL DIA*\n`;
        text += `Orden: #${s.id.substring(0, 6).toUpperCase()}\n`;
        text += `Fecha: ${d.toLocaleString('es-VE')}\n`;
        text += `================================\n`;
        if (s.items && s.items.length > 0) {
            s.items.forEach(item => {
                const qty = item.isWeight ? `${item.qty.toFixed(3)}Kg` : `${item.qty} Und`;
                text += `- ${item.name} ${qty} x $${item.priceUsd.toFixed(2)} = *$${(item.priceUsd * item.qty).toFixed(2)}*\n`;
            });
        }
        text += `\n*TOTAL: $${(s.totalUsd || 0).toFixed(2)}*\n`;
        text += `Ref: ${formatBs(s.totalBs || 0)} Bs\n`;
        const encoded = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };

    const handlePDF = (e) => {
        e.stopPropagation();
        generateTicketPDF(s, bcvRate);
    };

    return (
        <div className={`rounded-xl border transition-all ${isCanceled ? 'bg-red-50/50 border-red-100/50 dark:bg-red-900/10 dark:border-red-900/20' : 'bg-white dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-700/60'} overflow-hidden`}>
            <div
                className="flex items-center gap-3 p-3 cursor-pointer select-none active:bg-slate-100 dark:active:bg-slate-800"
                onClick={onToggle}
            >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCanceled ? 'bg-red-100 opacity-50' : 'bg-slate-50 dark:bg-slate-700 shadow-sm'}`}>
                    {isCanceled ? <Ban size={20} className="text-red-400" /> : (PayMethodIcon ? <PayMethodIcon size={20} className="text-slate-500" /> : <span className="text-xl">$</span>)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold flex items-center gap-1.5 truncate ${isCanceled ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {s.customerName || 'Consumidor Final'}
                        {s.tipo === 'VENTA_FIADA' && <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded uppercase">Fiado</span>}
                        {isCanceled && <span className="text-[9px] bg-red-100 text-red-500 px-1 rounded uppercase">Anulada</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>{dateLabel}</span> · <span>{d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span> · <span>{methodLabel}</span>
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${isCanceled ? 'text-slate-400' : 'text-slate-800 dark:text-white'}`}>${(s.totalUsd || 0).toFixed(2)}</p>
                    <div className="flex justify-end mt-0.5">
                        {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-slate-700/50 text-sm animate-in fade-in slide-in-from-top-1">
                    {s.items && s.items.length > 0 ? (
                        <div className="space-y-1 mb-3 pt-2">
                            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Productos ({s.items.length})</p>
                            {s.items.map((item, i) => (
                                <div key={i} className={`flex justify-between items-center text-xs ${isCanceled ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}`}>
                                    <span className="truncate pr-2">{item.isWeight ? `${item.qty.toFixed(3)}kg` : `${item.qty}u`} {item.name}</span>
                                    <span className="font-medium">${(item.priceUsd * item.qty).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 mb-3 pt-2">Pago de Deudas (Sin productos)</p>
                    )}

                    <div className="flex justify-between text-[10px] font-medium text-slate-400 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-2 mb-3">
                        <div className="flex flex-col gap-0.5">
                            <span>Ref: {formatBs(s.totalBs)} Bs @ {formatBs(s.rate || bcvRate)}</span>
                            {s.tasaCop > 0 && <span>COP: {(s.totalCop || (s.totalUsd * s.tasaCop)).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ {s.tasaCop}</span>}
                        </div>
                        {s.changeUsd > 0 && <div className="text-emerald-500 font-bold self-start mt-0.5">Vuelto: ${s.changeUsd.toFixed(2)}</div>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <button
                            onClick={handleShare}
                            className="flex-1 min-w-[120px] whitespace-nowrap py-2 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 active:scale-95"
                        >
                            <Send size={14} /> Compartir
                        </button>
                        <button
                            onClick={handlePDF}
                            className="py-2 px-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm active:scale-95"
                        >
                            PDF
                        </button>
                        {!isCanceled && onVoidSale && !s.cajaCerrada && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onVoidSale(s); }}
                                className="py-2 px-3 bg-slate-100 dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 hover:dark:bg-red-900/30 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95"
                            >
                                <Ban size={14} /> Anular
                            </button>
                        )}
                        {!isCanceled && s.cajaCerrada && (
                            <div title="Venta protegida por Cierre de Caja" className="py-2 px-3 bg-slate-50 dark:bg-slate-900 text-slate-400 font-bold rounded-lg flex justify-center items-center gap-1.5 text-[10px] uppercase border border-slate-100 dark:border-slate-800 tracking-wider cursor-not-allowed">
                                <LockIcon size={12} /> Cerrada
                            </div>
                        )}
                        {onRecycleSale && s.items && s.items.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onRecycleSale(s); }}
                                className="py-2 px-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 hover:dark:bg-indigo-900/50 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm active:scale-95"
                            >
                                <Recycle size={14} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
