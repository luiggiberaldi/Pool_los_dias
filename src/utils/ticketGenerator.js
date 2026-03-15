import { jsPDF } from 'jspdf';
import { formatBs } from './calculatorUtils';

/**
 * Genera un ticket PDF estilo recibo térmico 80mm.
 * Cada dato ocupa su propia línea — nada se solapa.
 */
export async function generateTicketPDF(sale, bcvRate) {
    const WIDTH = 80;
    const M = 6;
    const CX = WIDTH / 2;
    const RIGHT = WIDTH - M;

    const rate = sale.rate || bcvRate || 1;
    const itemCount = sale.items?.length || 0;
    const paymentCount = sale.payments?.length || 0;
    const hasFiado = sale.fiadoUsd > 0;

    // Altura MUY generosa para que nunca se corte
    const H = 160 + (itemCount * 14) + (paymentCount * 7) + (hasFiado ? 18 : 0);

    const doc = new jsPDF({ unit: 'mm', format: [WIDTH, H] });

    // Paleta
    const INK = [33, 37, 41];
    const BODY = [73, 80, 87];
    const MUTED = [134, 142, 150];
    const GREEN = [16, 124, 65];
    const RULE = [206, 212, 218];
    const RED = [220, 53, 69];

    let y = 8;

    // ── Helper: línea punteada ──
    const dash = (yy) => {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(M, yy, RIGHT, yy);
        doc.setLineDashPattern([], 0);
    };

    // ════════════════════════════════════
    //  LOGO
    // ════════════════════════════════════
    try {
        const img = new Image();
        img.src = '/logo.png';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const logoW = 50;
        const logoH = 12; // ~4:1 aspect ratio matching original
        doc.addImage(img, 'PNG', CX - logoW / 2, y, logoW, logoH);
        y += logoH + 4;
    } catch (_) { y += 2; }

    dash(y); y += 5;

    // ════════════════════════════════════
    //  INFO DEL TICKET (cada dato en su línea)
    // ════════════════════════════════════
    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const d = new Date(sale.timestamp);
    const fecha = d.toLocaleDateString('es-VE');
    const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('N°:', M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${saleNum}`, M + 8, y);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${fecha}  ${hora}`, RIGHT, y, { align: 'right' });
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Cliente:', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BODY);
    doc.text(sale.customerName || 'Consumidor Final', M + 14, y);
    y += 6;

    if (sale.customerDocument) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...INK);
        doc.text('C.I/RIF:', M, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BODY);
        doc.text(sale.customerDocument, M + 14, y);
        y += 6;
    }

    dash(y); y += 5;

    // ════════════════════════════════════
    //  ENCABEZADO DE PRODUCTOS
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('CANT', M, y);
    doc.text('DESCRIPCIÓN', M + 10, y);
    doc.text('IMPORTE', RIGHT, y, { align: 'right' });
    y += 5;

    // ════════════════════════════════════
    //  PRODUCTOS
    // ════════════════════════════════════
    if (sale.items && sale.items.length > 0) {
        sale.items.forEach(item => {
            const qty = item.isWeight ? item.qty.toFixed(2) : String(item.qty);
            const unit = item.isWeight ? 'Kg' : 'u';
            const sub = item.priceUsd * item.qty;
            const subBs = sub * rate;
            const name = item.name.length > 20 ? item.name.substring(0, 20) + '…' : item.name;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...INK);
            doc.text(`${qty}${unit}`, M, y);
            doc.text(name, M + 10, y);
            doc.setFont('helvetica', 'bold');
            doc.text('$' + sub.toFixed(2), RIGHT, y, { align: 'right' });
            y += 4;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text('$' + item.priceUsd.toFixed(2) + ' c/u  ·  Bs ' + formatBs(subBs), M + 10, y);
            y += 6;
        });
    }

    y += 2;
    dash(y); y += 7;

    // ════════════════════════════════════
    //  TASA DE CAMBIO (centrada, sola)
    // ════════════════════════════════════
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Tasa BCV: Bs ' + formatBs(rate) + ' por $1', CX, y, { align: 'center' });
    y += 8;

    // ════════════════════════════════════
    //  TOTAL (cada cosa en su propia línea, centrado)
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BODY);
    doc.text('TOTAL A PAGAR', CX, y, { align: 'center' });
    y += 8;

    // Monto USD — GRANDE
    doc.setFontSize(20);
    doc.setTextColor(...GREEN);
    const totalUsdStr = '$' + parseFloat(sale.totalUsd || 0).toFixed(2);
    doc.text(totalUsdStr, CX, y, { align: 'center' });
    y += 8;

    // Monto Bs — debajo
    doc.setFontSize(10);
    doc.setTextColor(...BODY);
    const totalBsStr = 'Bs ' + formatBs(sale.totalBs || 0);
    doc.text(totalBsStr, CX, y, { align: 'center' });
    y += 8;

    dash(y); y += 7;

    // ════════════════════════════════════
    //  PAGOS REALIZADOS
    // ════════════════════════════════════
    const showPayments = (sale.payments && sale.payments.length > 0) || hasFiado;
    if (showPayments) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text('PAGOS REALIZADOS', M, y);
        y += 5;

        if (sale.payments && sale.payments.length > 0) {
            sale.payments.forEach(p => {
                const isBs = p.currency ? p.currency !== 'USD' : (p.methodId.includes('_bs') || p.methodId === 'pago_movil');
                const val = isBs
                    ? 'Bs ' + formatBs(p.amountBs || (p.amountUsd * rate))
                    : '$' + (p.amountUsd || 0).toFixed(2);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(...BODY);
                doc.text(p.methodLabel || 'Pago', M, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...INK);
                doc.text(val, RIGHT, y, { align: 'right' });
                y += 5;
            });
        }

        if (hasFiado) {
            y += 2;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...RED);
            doc.text('Deuda pendiente:', M, y);
            doc.text('$' + sale.fiadoUsd.toFixed(2), RIGHT, y, { align: 'right' });
            y += 4;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.text('Bs ' + formatBs(sale.fiadoUsd * rate), RIGHT, y, { align: 'right' });
            y += 6;
        }

        y += 2;
        dash(y); y += 7;
    }

    // ════════════════════════════════════
    //  PIE
    // ════════════════════════════════════
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('¡Gracias por tu compra!', CX, y, { align: 'center' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text('Comprobante digital · Sin valor fiscal', CX, y, { align: 'center' });

    // ── DESCARGAR / COMPARTIR ──
    const filename = 'ticket_' + saleNum + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Ticket #' + saleNum, files: [file] })
            .catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}
