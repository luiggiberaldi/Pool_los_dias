import { jsPDF } from 'jspdf';

/**
 * Genera e imprime una pre-cuenta PDF para mesa de pool.
 */
export async function generatePartialSessionTicketPDF({ table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD }) {
    const WIDTH = 58;
    const M = 3;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    const itemCount = currentItems?.length || 0;
    const H = 90 + (itemCount * 14);

    const doc = new jsPDF({ unit: 'mm', format: [WIDTH, H] });
    const INK = [33, 37, 41];
    const RULE = [206, 212, 218];

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

    dash(y);
    y += 6;

    // TIEMPO / PARTIDAS
    if (timeCost > 0) {
        const isPina = session.game_mode === 'PINA';
        doc.setFont('helvetica', 'bold');
        doc.text(isPina ? "Partidas (La Piña)" : "Tiempo de Mesa", M, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        if (isPina) {
            const partidas = 1 + (Number(session.extended_times) || 0);
            doc.text(`${partidas} piña${partidas !== 1 ? 's' : ''} x $${(timeCost / partidas).toFixed(2)}`, M, y);
        } else {
            const horas = elapsed / 60;
            doc.text(`${horas < 1 ? Math.ceil(horas * 60) + ' min' : (horas).toFixed(1) + 'h'}`, M, y);
        }
        doc.text(`$${timeCost.toFixed(2)}`, RIGHT, y, { align: 'right' });
        y += 6;
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
            y += 5;
        });
        y += 2;
    }

    dash(y);
    y += 6;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("TOTAL ESTIMADO:", M, y);
    doc.text(`$${grandTotal.toFixed(2)}`, RIGHT, y, { align: 'right' });
    y += 6;

    doc.setFontSize(8);
    doc.text(`Ref: BS. ${(grandTotal * (tasaUSD || 1)).toFixed(2)}`, RIGHT, y, { align: 'right' });

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
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            window.open(blobUrl, '_blank');
        }
    };
}
