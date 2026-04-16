import { printPreCuentaEscPos, getWebSerialConfig } from '../services/webSerialPrinter';
import { calculateGrandTotalBs, calculateTimeCostBs, calculateSessionCostBreakdown, formatHoursPaid, calculateFullTableBreakdown } from './tableBillingEngine';
import { round2 } from './dinero';

/**
 * Genera e imprime una pre-cuenta para mesa de pool.
 * - Si hay impresora térmica ESC/POS configurada: imprime directo via WebSerial
 *   SIN abrir el cajón de dinero (el cajón solo debe abrirse en ventas exitosas).
 * - Sin impresora térmica: genera PDF via jsPDF + iframe.
 */
export async function generatePartialSessionTicketPDF({ table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config, hoursOffset = 0, roundsOffset = 0 }) {
    // Intentar ESC/POS directo si hay impresora térmica configurada.
    const cfg = getWebSerialConfig();
    if (cfg.printerType !== 'system') {
        const hasWebSerialConfigured = cfg.printerType && cfg.printerType !== 'system';
        if (hasWebSerialConfigured) {
            try {
                const printed = await printPreCuentaEscPos({ table, session, elapsed, timeCost, currentItems, grandTotal, tasaUSD, config, hoursOffset, roundsOffset });
                if (printed) return;
                throw new Error('Puerto no disponible. Ve a Configuración → Impresora y pulsa "Detectar impresora".');
            } catch (err) {
                throw err;
            }
        }
        const tryEscPos = 'serial' in navigator;
        if (tryEscPos) {
            try {
                const printed = await printPreCuentaEscPos({ table, session, elapsed, timeCost, currentItems, grandTotal, tasaUSD, config, hoursOffset, roundsOffset });
                if (printed) return;
            } catch (err) {
                console.warn('[PreCuenta] ESC/POS falló, usando fallback PDF:', err.message);
            }
        }
    }

    const seats = session?.seats || [];
    const isMultiClient = seats.length > 1;

    const WIDTH = 58;
    const M = 5;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    // Calcular datos de pagos previos — modo mixto aware
    const isPina = session.game_mode === 'PINA';
    const pinaCount = isPina ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
    const hasPinas = isPina || pinaCount > 0;
    const totalHours = Number(session.hours_paid) || 0;
    const hasHours = totalHours > 0;
    const hasPaidBefore = roundsOffset > 0 || hoursOffset > 0;

    // Seat-level charges
    const seatHasPinas = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const seatHasHours = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));

    const itemCount = currentItems?.length || 0;

    // ── Generar HTML para impresión directa ────────────────────────────────
    // Usar HTML + @page CSS en vez de PDF para que el navegador respete
    // el tamaño de página y no use el largo fijo del driver (3276mm).
    const lines = [];
    const push = (html) => lines.push(html);

    push(`<div class="title">PRE-CUENTA MESA</div>`);
    push(`<div class="subtitle">${table.name.toUpperCase()}</div>`);
    push(`<hr>`);
    const d = new Date();
    push(`<div class="small">Fecha: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}</div>`);
    if (session?.client_name) push(`<div class="bold">Cliente: ${session.client_name}</div>`);
    if (session?.notes) push(`<div class="note">Nota: ${session.notes.substring(0, 60)}</div>`);
    push(`<hr>`);

    if (isMultiClient) {
        const breakdown = calculateFullTableBreakdown(session, seats, elapsed, config, currentItems);
        if (breakdown) {
            if (breakdown.sharedTotal > 0) {
                push(`<div class="bold accent">COMPARTIDO</div>`);
                if (hasPinas) {
                    const pp = config?.pricePina || 0;
                    push(`<div class="row"><span>${pinaCount} piña${pinaCount !== 1 ? 's' : ''} x $${pp.toFixed(2)}</span><span>$${round2(pinaCount * pp).toFixed(2)}</span></div>`);
                }
                if (hasHours) {
                    const ph = config?.pricePerHour || 0;
                    push(`<div class="row"><span>${formatHoursPaid(totalHours)} x $${ph.toFixed(2)}</span><span>$${round2(totalHours * ph).toFixed(2)}</span></div>`);
                }
                breakdown.sharedItems.forEach(i => {
                    const t = i.qty * i.unit_price_usd;
                    push(`<div class="row"><span>${i.qty}x ${(i.product_name || '').substring(0, 16)}</span><span>$${t.toFixed(2)}</span></div>`);
                });
                push(`<div class="muted small">Total compartido: $${breakdown.sharedTotal.toFixed(2)} (÷${seats.filter(s => !s.paid).length})</div>`);
                push(`<hr>`);
            }
            breakdown.seats.forEach((sb) => {
                const seatLabel = sb.seat.label || `Cliente ${seats.indexOf(sb.seat) + 1}`;
                push(`<div class="row"><span class="bold accent">${seatLabel.toUpperCase()}</span>${sb.seat.paid ? '<span class="muted">PAGADO</span>' : ''}</div>`);
                if (sb.timeCost.total > 0) {
                    if (sb.timeCost.hasPinas) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'pina') || [];
                        const pp = config?.pricePina || 0;
                        push(`<div class="row"><span>${tc.length} piña${tc.length !== 1 ? 's' : ''} x $${pp.toFixed(2)}</span><span>$${sb.timeCost.pinaCost.toFixed(2)}</span></div>`);
                    }
                    if (sb.timeCost.hasHours) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'hora') || [];
                        const totalH = tc.reduce((sum, c) => sum + (c.hours || 0), 0);
                        const ph = config?.pricePerHour || 0;
                        push(`<div class="row"><span>${formatHoursPaid(totalH)} x $${ph.toFixed(2)}</span><span>$${sb.timeCost.hourCost.toFixed(2)}</span></div>`);
                    }
                }
                sb.items.forEach(i => {
                    const t = i.qty * i.unit_price_usd;
                    push(`<div class="row"><span>${i.qty}x ${(i.product_name || '').substring(0, 16)}</span><span>$${t.toFixed(2)}</span></div>`);
                });
                if (sb.sharedPortion > 0 && !sb.seat.paid) {
                    push(`<div class="row muted small"><span>Parte compartida</span><span>$${sb.sharedPortion.toFixed(2)}</span></div>`);
                }
                push(`<div class="row bold"><span>Subtotal:</span><span>$${sb.subtotal.toFixed(2)}</span></div>`);
                const subBs = sb.subtotal * (tasaUSD || 1);
                push(`<div class="right muted small">Bs ${subBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`);
                push(`<hr>`);
            });
        }
    } else {
        // PIÑAS
        if (hasPinas || seatHasPinas) {
            const pricePerPina = config?.pricePina || 0;
            const seatPinas = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
            const totalPinas = pinaCount + seatPinas;
            const fullCost = round2(totalPinas * pricePerPina);
            const paidCost = round2(roundsOffset * pricePerPina);
            push(`<div class="bold">Partidas (La Piña)</div>`);
            push(`<div class="row"><span>${totalPinas} piña${totalPinas !== 1 ? 's' : ''} x $${pricePerPina.toFixed(2)}</span><span>$${fullCost.toFixed(2)}</span></div>`);
            const fullBs = config ? calculateTimeCostBs(fullCost, 'PINA', config, tasaUSD) : (fullCost * (tasaUSD || 1));
            push(`<div class="right muted small">Bs ${fullBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`);
            if (roundsOffset > 0) {
                push(`<div class="row muted"><span>Pagado (${roundsOffset} piña${roundsOffset !== 1 ? 's' : ''})</span><span>-$${paidCost.toFixed(2)}</span></div>`);
            }
        }

        // HORAS
        if (hasHours || seatHasHours) {
            const pricePerHour = config?.pricePerHour || 0;
            const seatHoursTotal = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (tc.hours || 0), 0), 0);
            const combinedHours = totalHours + seatHoursTotal;
            const fullCost = round2(combinedHours * pricePerHour);
            const paidCost = round2(hoursOffset * pricePerHour);
            push(`<div class="bold">Tiempo de Mesa</div>`);
            push(`<div class="row"><span>${formatHoursPaid(combinedHours)} x $${pricePerHour.toFixed(2)}</span><span>$${fullCost.toFixed(2)}</span></div>`);
            const fullBs = config ? calculateTimeCostBs(fullCost, 'NORMAL', config, tasaUSD) : (fullCost * (tasaUSD || 1));
            push(`<div class="right muted small">Bs ${fullBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`);
            if (hoursOffset > 0) {
                push(`<div class="row muted"><span>Pagado (${formatHoursPaid(hoursOffset)})</span><span>-$${paidCost.toFixed(2)}</span></div>`);
            }
        }

        // CONSUMO
        if (currentItems.length > 0) {
            push(`<div class="bold">Consumo Bar</div>`);
            currentItems.forEach(i => {
                const t = i.qty * i.unit_price_usd;
                push(`<div class="row"><span>${i.qty}x ${i.product_name.substring(0, 16)}</span><span>$${t.toFixed(2)}</span></div>`);
                const itemBs = t * (tasaUSD || 1);
                push(`<div class="right muted small">Bs ${itemBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>`);
            });
        }
    }

    push(`<hr>`);
    const totalLabel = hasPaidBefore ? "TOTAL PENDIENTE:" : "TOTAL ESTIMADO:";
    push(`<div class="row total"><span>${totalLabel}</span><span>$${grandTotal.toFixed(2)}</span></div>`);
    const bkdn = calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, 0, 0);
    const refBs = config ? calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD, bkdn).toFixed(2) : (grandTotal * (tasaUSD || 1)).toFixed(2);
    push(`<div class="right small">Ref: BS. ${refBs}</div>`);
    push(`<div class="center disclaimer">*** NO ES RECIBO DE PAGO ***</div>`);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 58mm auto; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 48mm; max-width: 48mm; margin: 0 auto; font-family: 'Courier New', 'Lucida Console', monospace; font-size: 8pt; color: #212529; padding: 4mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.title { text-align: center; font-weight: bold; font-size: 12pt; }
.subtitle { text-align: center; font-weight: bold; font-size: 9pt; margin-bottom: 2mm; }
hr { border: none; border-top: 1px dashed #ced4da; margin: 2mm 0; }
.row { display: flex; justify-content: space-between; line-height: 1.6; }
.bold { font-weight: bold; }
.small { font-size: 7pt; }
.note { font-size: 7pt; }
.muted { color: #787878; }
.accent { color: #1d4e89; }
.right { text-align: right; }
.center { text-align: center; }
.total { font-size: 10pt; font-weight: bold; margin-top: 1mm; }
.disclaimer { margin-top: 3mm; font-size: 7pt; }
@media print { body { width: 48mm; max-width: 48mm; } }
@media screen { body { border: 1px solid #ccc; margin-top: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); } }
</style></head><body>${lines.join('')}</body></html>`;

    // Imprimir midiendo el contenido real para evitar papel en blanco extra
    _openAndPrintPreCuenta(html);
}

/**
 * Abre ventana de impresión, mide el contenido real y ajusta @page antes de imprimir.
 */
function _openAndPrintPreCuenta(html) {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        const iframe = document.createElement('iframe');
        Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        setTimeout(() => {
            _adjustAndPrint(iframe.contentWindow, iframe.contentDocument);
            setTimeout(() => iframe.remove(), 5000);
        }, 300);
        return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        setTimeout(() => _adjustAndPrint(printWindow, printWindow.document), 400);
    };
    setTimeout(() => {
        try { _adjustAndPrint(printWindow, printWindow.document); } catch(_) {}
    }, 1500);
}

/**
 * Mide la altura real del contenido y reescribe @page con esa altura exacta.
 */
function _adjustAndPrint(win, doc) {
    try {
        const contentH = doc.body.scrollHeight;
        const heightMm = Math.ceil(contentH / 3.7795) + 2;
        const style = doc.createElement('style');
        style.textContent = `@page { size: 58mm ${heightMm}mm !important; margin: 0 !important; }`;
        doc.head.appendChild(style);
    } catch(_) {}
    win.print();
}
