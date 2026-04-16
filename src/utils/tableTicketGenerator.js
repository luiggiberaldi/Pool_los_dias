import { jsPDF } from 'jspdf';
import { printPreCuentaEscPos, getWebSerialConfig } from '../services/webSerialPrinter';
import { calculateGrandTotalBs, calculateTimeCostBs, calculateSessionCostBreakdown, calculateSeatCostBreakdown, formatHoursPaid, calculateFullTableBreakdown } from './tableBillingEngine';
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
    const seatExtraLines = isMultiClient ? (seats.length * 30) : 0;
    // Altura generosa inicial — se recorta al final al contenido real
    const H_MAX = 120 + (itemCount * 18) + (hasPaidBefore ? 16 : 0) + (hasPinas && hasHours ? 30 : 0) + seatExtraLines;

    const doc = new jsPDF({ unit: 'mm', format: [WIDTH, H_MAX] });
    const INK = [33, 37, 41];
    const RULE = [206, 212, 218];
    const PAID_CLR = [120, 120, 120];
    const ACCENT = [29, 78, 137];

    let y = 8;
    const dash = (yy) => {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(M, yy, RIGHT, yy);
        doc.setLineDashPattern([], 0);
    };

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.setFontSize(14);
    doc.text("PRE-CUENTA MESA", CX, y, { align: 'center' });
    y += 6;
    doc.setFontSize(10);
    doc.text(table.name.toUpperCase(), CX, y, { align: 'center' });
    y += 6;

    dash(y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const d = new Date();
    doc.text(`Fecha: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`, M, y);
    y += 5;

    if (session?.client_name) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Cliente: ${session.client_name}`, M, y);
        doc.setFont('helvetica', 'normal');
        y += 5;
    }

    if (session?.notes) {
        doc.setFontSize(7);
        doc.text(`Nota: ${session.notes.substring(0, 60)}`, M, y);
        doc.setFontSize(8);
        y += 4;
    }

    dash(y);
    y += 6;

    // ═══ MULTI-CLIENT: show per-seat breakdown ═══
    if (isMultiClient) {
        const breakdown = calculateFullTableBreakdown(session, seats, elapsed, config, currentItems);

        if (breakdown) {
            // ── Shared section ──
            if (breakdown.sharedTotal > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...ACCENT);
                doc.text("COMPARTIDO", M, y);
                doc.setTextColor(...INK);
                y += 4;
                doc.setFont('helvetica', 'normal');

                // Shared piñas
                if (hasPinas) {
                    const pricePerPina = config?.pricePina || 0;
                    doc.text(`${pinaCount} piña${pinaCount !== 1 ? 's' : ''} x $${pricePerPina.toFixed(2)}`, M, y);
                    const pinaCost = round2(pinaCount * pricePerPina);
                    doc.text(`$${pinaCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
                    y += 4;
                }

                // Shared hours
                if (hasHours) {
                    const pricePerHour = config?.pricePerHour || 0;
                    const hourCost = round2(totalHours * pricePerHour);
                    doc.text(`${formatHoursPaid(totalHours)} x $${pricePerHour.toFixed(2)}`, M, y);
                    doc.text(`$${hourCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
                    y += 4;
                }

                // Shared consumption items
                if (breakdown.sharedItems.length > 0) {
                    breakdown.sharedItems.forEach(i => {
                        const t = i.qty * i.unit_price_usd;
                        doc.text(`${i.qty}x ${(i.product_name || '').substring(0, 16)}`, M, y);
                        doc.text(`$${t.toFixed(2)}`, RIGHT, y, { align: 'right' });
                        y += 4;
                    });
                }

                doc.setFontSize(7);
                doc.setTextColor(...PAID_CLR);
                doc.text(`Total compartido: $${breakdown.sharedTotal.toFixed(2)} (÷${seats.filter(s => !s.paid).length})`, M, y);
                doc.setFontSize(8);
                doc.setTextColor(...INK);
                y += 5;
                dash(y);
                y += 5;
            }

            // ── Per-seat sections ──
            breakdown.seats.forEach((sb) => {
                const seatLabel = sb.seat.label || `Cliente ${seats.indexOf(sb.seat) + 1}`;
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...ACCENT);
                doc.text(seatLabel.toUpperCase(), M, y);
                if (sb.seat.paid) {
                    doc.setTextColor(...PAID_CLR);
                    doc.text('PAGADO', RIGHT, y, { align: 'right' });
                }
                doc.setTextColor(...INK);
                y += 4;
                doc.setFont('helvetica', 'normal');

                // Seat time charges
                if (sb.timeCost.total > 0) {
                    if (sb.timeCost.hasPinas) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'pina') || [];
                        const pCount = tc.length;
                        const pp = config?.pricePina || 0;
                        doc.text(`${pCount} piña${pCount !== 1 ? 's' : ''} x $${pp.toFixed(2)}`, M, y);
                        doc.text(`$${sb.timeCost.pinaCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
                        y += 4;
                    }
                    if (sb.timeCost.hasHours) {
                        const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'hora') || [];
                        const totalH = tc.reduce((sum, c) => sum + (c.hours || 0), 0);
                        const ph = config?.pricePerHour || 0;
                        doc.text(`${formatHoursPaid(totalH)} x $${ph.toFixed(2)}`, M, y);
                        doc.text(`$${sb.timeCost.hourCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
                        y += 4;
                    }
                }

                // Seat consumption
                if (sb.items.length > 0) {
                    sb.items.forEach(i => {
                        const t = i.qty * i.unit_price_usd;
                        doc.text(`${i.qty}x ${(i.product_name || '').substring(0, 16)}`, M, y);
                        doc.text(`$${t.toFixed(2)}`, RIGHT, y, { align: 'right' });
                        y += 4;
                    });
                }

                // Shared portion
                if (sb.sharedPortion > 0 && !sb.seat.paid) {
                    doc.setFontSize(7);
                    doc.setTextColor(...PAID_CLR);
                    doc.text(`Parte compartida`, M, y);
                    doc.text(`$${sb.sharedPortion.toFixed(2)}`, RIGHT, y, { align: 'right' });
                    doc.setFontSize(8);
                    doc.setTextColor(...INK);
                    y += 4;
                }

                // Seat subtotal
                doc.setFont('helvetica', 'bold');
                doc.text(`Subtotal:`, M, y);
                doc.text(`$${sb.subtotal.toFixed(2)}`, RIGHT, y, { align: 'right' });
                y += 4;
                const subBs = sb.subtotal * (tasaUSD || 1);
                doc.setFontSize(7);
                doc.setTextColor(...PAID_CLR);
                doc.text(`Bs ${subBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, RIGHT, y, { align: 'right' });
                doc.setFontSize(8);
                doc.setTextColor(...INK);
                doc.setFont('helvetica', 'normal');
                y += 5;
                dash(y);
                y += 5;
            });
        }
    } else {
        // ═══ SINGLE CLIENT / LEGACY: original format ═══

        // PIÑAS
        if (hasPinas || seatHasPinas) {
            const pricePerPina = config?.pricePina || 0;
            // Include seat-level piñas
            const seatPinas = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
            const totalPinas = pinaCount + seatPinas;
            const fullCost = round2(totalPinas * pricePerPina);
            const paidCost = round2(roundsOffset * pricePerPina);

            doc.setFont('helvetica', 'bold');
            doc.text("Partidas (La Piña)", M, y);
            y += 4;
            doc.setFont('helvetica', 'normal');

            doc.text(`${totalPinas} piña${totalPinas !== 1 ? 's' : ''} x $${pricePerPina.toFixed(2)}`, M, y);
            doc.text(`$${fullCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
            y += 4;
            const fullBs = config ? calculateTimeCostBs(fullCost, 'PINA', config, tasaUSD) : (fullCost * (tasaUSD || 1));
            doc.setFontSize(7);
            doc.setTextColor(...PAID_CLR);
            doc.text(`Bs ${fullBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, RIGHT, y, { align: 'right' });
            doc.setFontSize(8);
            doc.setTextColor(...INK);
            y += 5;

            if (roundsOffset > 0) {
                doc.setTextColor(...PAID_CLR);
                doc.text(`Pagado (${roundsOffset} piña${roundsOffset !== 1 ? 's' : ''})`, M, y);
                doc.text(`-$${paidCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
                doc.setTextColor(...INK);
                y += 5;
            }
            y += 1;
        }

        // HORAS
        if (hasHours || seatHasHours) {
            const pricePerHour = config?.pricePerHour || 0;
            const seatHoursTotal = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (tc.hours || 0), 0), 0);
            const combinedHours = totalHours + seatHoursTotal;
            const fullCost = round2(combinedHours * pricePerHour);
            const paidCost = round2(hoursOffset * pricePerHour);

            doc.setFont('helvetica', 'bold');
            doc.text("Tiempo de Mesa", M, y);
            y += 4;
            doc.setFont('helvetica', 'normal');

            doc.text(`${formatHoursPaid(combinedHours)} x $${pricePerHour.toFixed(2)}`, M, y);
            doc.text(`$${fullCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
            y += 4;
            const fullBs = config ? calculateTimeCostBs(fullCost, 'NORMAL', config, tasaUSD) : (fullCost * (tasaUSD || 1));
            doc.setFontSize(7);
            doc.setTextColor(...PAID_CLR);
            doc.text(`Bs ${fullBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, RIGHT, y, { align: 'right' });
            doc.setFontSize(8);
            doc.setTextColor(...INK);
            y += 5;

            if (hoursOffset > 0) {
                doc.setTextColor(...PAID_CLR);
                doc.text(`Pagado (${formatHoursPaid(hoursOffset)})`, M, y);
                doc.text(`-$${paidCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
                doc.setTextColor(...INK);
                y += 5;
            }
            y += 1;
        }

        // CONSUMO
        if (currentItems.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text("Consumo Bar", M, y);
            y += 5;

            doc.setFont('helvetica', 'normal');
            currentItems.forEach(i => {
                doc.text(`${i.qty}x ${i.product_name.substring(0, 16)}`, M, y);
                const t = i.qty * i.unit_price_usd;
                doc.text(`$${t.toFixed(2)}`, RIGHT, y, { align: 'right' });
                y += 4;
                const itemBs = t * (tasaUSD || 1);
                doc.setFontSize(7);
                doc.setTextColor(...PAID_CLR);
                doc.text(`Bs ${itemBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, RIGHT, y, { align: 'right' });
                doc.setFontSize(8);
                doc.setTextColor(...INK);
                y += 5;
            });
            y += 2;
        }
    }

    dash(y);
    y += 6;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(hasPaidBefore ? "TOTAL PENDIENTE:" : "TOTAL ESTIMADO:", M, y);
    doc.text(`$${grandTotal.toFixed(2)}`, RIGHT, y, { align: 'right' });
    y += 6;

    doc.setFontSize(8);
    const breakdown = calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, 0, 0);
    doc.text(`Ref: BS. ${config ? calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD, breakdown).toFixed(2) : (grandTotal * (tasaUSD || 1)).toFixed(2)}`, RIGHT, y, { align: 'right' });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text("*** NO ES RECIBO DE PAGO ***", CX, y, { align: 'center' });

    // Recortar la página al contenido real para evitar espacio en blanco
    const finalHeight = y + 5;
    doc.internal.pageSize.setHeight(finalHeight);

    // Print
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
        try {
            const style = iframe.contentDocument.createElement('style');
            style.textContent = '@page { margin: 0; } body { margin: 0; }';
            iframe.contentDocument.head.appendChild(style);
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            window.open(blobUrl, '_blank');
        }
    };
}
