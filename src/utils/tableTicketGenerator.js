import { jsPDF } from 'jspdf';
import { printPreCuentaEscPos, getWebSerialConfig } from '../services/webSerialPrinter';
import { calculateGrandTotalBs, calculateTimeCostBs } from './tableBillingEngine';
import { round2 } from './dinero';

/**
 * Genera e imprime una pre-cuenta para mesa de pool.
 * - Si hay impresora térmica ESC/POS configurada: imprime directo via WebSerial
 *   SIN abrir el cajón de dinero (el cajón solo debe abrirse en ventas exitosas).
 * - Sin impresora térmica: genera PDF via jsPDF + iframe.
 */
export async function generatePartialSessionTicketPDF({ table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config, hoursOffset = 0, roundsOffset = 0 }) {
    // Intentar ESC/POS directo si hay impresora configurada o puerto disponible.
    const cfg = getWebSerialConfig();
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
    const WIDTH = 58;
    const M = 5;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    // Calcular datos de pagos previos
    const isPina = session.game_mode === 'PINA';
    const totalRounds = isPina ? 1 + (Number(session.extended_times) || 0) : 0;
    const totalHours = !isPina ? (Number(session.hours_paid) || 0) : 0;
    const hasPaidBefore = roundsOffset > 0 || hoursOffset > 0;

    const itemCount = currentItems?.length || 0;
    const H = 100 + (itemCount * 18) + (hasPaidBefore ? 16 : 0);

    const doc = new jsPDF({ unit: 'mm', format: [WIDTH, H] });
    const INK = [33, 37, 41];
    const RULE = [206, 212, 218];
    const PAID_CLR = [120, 120, 120];

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

    // TIEMPO / PARTIDAS
    if (isPina) {
        const pricePerPina = config?.pricePina || 0;
        const fullCost = round2(totalRounds * pricePerPina);
        const paidCost = round2(roundsOffset * pricePerPina);

        doc.setFont('helvetica', 'bold');
        doc.text("Partidas (La Piña)", M, y);
        y += 4;
        doc.setFont('helvetica', 'normal');

        // Total line
        doc.text(`${totalRounds} piña${totalRounds !== 1 ? 's' : ''} x $${pricePerPina.toFixed(2)}`, M, y);
        doc.text(`$${fullCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
        y += 4;
        const fullBs = config ? calculateTimeCostBs(fullCost, session?.game_mode, config, tasaUSD) : (fullCost * (tasaUSD || 1));
        doc.setFontSize(7);
        doc.setTextColor(...PAID_CLR);
        doc.text(`Bs ${fullBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, RIGHT, y, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        y += 5;

        // Paid deduction
        if (roundsOffset > 0) {
            doc.setTextColor(...PAID_CLR);
            doc.text(`Pagado (${roundsOffset} piña${roundsOffset !== 1 ? 's' : ''})`, M, y);
            doc.text(`-$${paidCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
            doc.setTextColor(...INK);
            y += 5;
        }
        y += 1;
    } else if (timeCost > 0 || hoursOffset > 0) {
        const pricePerHour = config?.pricePerHour || 0;
        const fullHours = totalHours;
        const fullCost = round2(fullHours * pricePerHour);
        const paidCost = round2(hoursOffset * pricePerHour);

        doc.setFont('helvetica', 'bold');
        doc.text("Tiempo de Mesa", M, y);
        y += 4;
        doc.setFont('helvetica', 'normal');

        // Total line
        doc.text(`${fullHours}h x $${pricePerHour.toFixed(2)}`, M, y);
        doc.text(`$${fullCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
        y += 4;
        const fullBs = config ? calculateTimeCostBs(fullCost, session?.game_mode, config, tasaUSD) : (fullCost * (tasaUSD || 1));
        doc.setFontSize(7);
        doc.setTextColor(...PAID_CLR);
        doc.text(`Bs ${fullBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, RIGHT, y, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        y += 5;

        // Paid deduction
        if (hoursOffset > 0) {
            doc.setTextColor(...PAID_CLR);
            doc.text(`Pagado (${hoursOffset}h)`, M, y);
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

    dash(y);
    y += 6;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(hasPaidBefore ? "TOTAL PENDIENTE:" : "TOTAL ESTIMADO:", M, y);
    doc.text(`$${grandTotal.toFixed(2)}`, RIGHT, y, { align: 'right' });
    y += 6;

    doc.setFontSize(8);
    doc.text(`Ref: BS. ${config ? calculateGrandTotalBs(timeCost, totalConsumption, session?.game_mode, config, tasaUSD).toFixed(2) : (grandTotal * (tasaUSD || 1)).toFixed(2)}`, RIGHT, y, { align: 'right' });

    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text("*** NO ES RECIBO DE PAGO ***", CX, y, { align: 'center' });

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
