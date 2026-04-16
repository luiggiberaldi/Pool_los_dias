import { formatBs, capitalizeName } from './calculatorUtils';
import { printReceiptEscPos, getWebSerialConfig } from '../services/webSerialPrinter';

/**
 * Imprime un ticket de venta.
 * - Impresora del sistema (inkjet/laser): va directo a window.print()
 * - Impresora térmica configurada: ESC/POS directo, sin diálogo
 * - Sin configuración: intenta ESC/POS y si falla usa window.print()
 */
export async function printThermalTicket(sale, bcvRate) {
    const cfg = getWebSerialConfig();

    // Impresora del sistema → ir directo a window.print()
    if (cfg.printerType === 'system') {
        _printThermalHTML(sale, bcvRate);
        return;
    }

    // Impresora térmica → intentar ESC/POS
    try {
        const printed = await printReceiptEscPos(sale, bcvRate);
        if (printed) return;
    } catch (err) {
        console.warn('[Ticket] ESC/POS falló, usando fallback HTML:', err.message);
    }

    // Fallback: HTML + window.print()
    _printThermalHTML(sale, bcvRate);
}

function _printThermalHTML(sale, bcvRate) {
    // ── CONFIGURACIÓN DE TAMAÑOS (58mm) ──
    // Usa 58mm auto — el navegador calcula el largo automáticamente.
    const cssPageSize = '58mm auto';
    const cssBodyWidth = '48mm';
    const cssLogoW = '44mm';
    const fDisclaimer = '7.5px';
    const fTiny = '9px';     // Secundaria (detalles, RIF, c/u)
    const fSmall = '10px';   // Info general (fechas, nro)
    const fBase = '11px';    // Primaria (Items, label totales)
    const fTitle = '14px';   // Nombre negocio
    const fTotalU = '24px';  // Total $
    const fTotalB = '14px';  // Total Bs
    const hasFiado = (sale.fiadoUsd || 0) > 0;

    // ── OBTENER CONFIGURACIÓN DEL NEGOCIO ──
    const settings = {
        name: localStorage.getItem('business_name') || 'Pool Los Diaz',
        rif: localStorage.getItem('business_rif') || '',
        address: localStorage.getItem('business_address') || '',
        phone: localStorage.getItem('business_phone') || '',
        instagram: localStorage.getItem('business_instagram') || ''
    };

    const rate = sale.rate || bcvRate || 1;
    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const d = new Date(sale.timestamp);
    const fecha = d.toLocaleDateString('es-VE');
    const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    // Generar filas de productos
    const itemsHtml = (sale.items || []).map(item => {
        const qty = item.isWeight ? item.qty.toFixed(2) : String(item.qty);
        const unit = item.isWeight ? 'Kg' : 'u';
        const sub = item.priceUsd * item.qty;
        const subBs = sub * rate;
        const name = item.name.length > 22 ? item.name.substring(0, 22) + '...' : item.name;
        return `
            <tr>
                <td style="text-align:left;font-size:${fBase};padding:2px 0;">${qty}${unit}</td>
                <td style="text-align:left;font-size:${fBase};padding:2px 0;line-height:1.2;">${name}</td>
                <td style="text-align:right;font-size:${fBase};font-weight:bold;padding:2px 0;">$${sub.toFixed(2)}</td>
            </tr>
            <tr>
                <td></td>
                <td colspan="2" style="font-size:${fTiny};color:#888;padding:0 0 4px;">$${item.priceUsd.toFixed(2)} c/u - Bs ${formatBs(subBs)}</td>
            </tr>`;
    }).join('');

    // Generar filas de pagos
    const paymentsHtml = (sale.payments || []).map(p => {
        const isCop = p.currency === 'COP';
        const isBs = !isCop && (p.currency ? p.currency !== 'USD' : (p.methodId?.includes('_bs') || p.methodId === 'pago_movil'));
        const val = isCop
            ? 'COP ' + (p.amountBs || (p.amountUsd * (sale.tasaCop || 1))).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : isBs
            ? 'Bs ' + formatBs(p.amountBs || (p.amountUsd * rate))
            : '$' + (p.amountUsd || 0).toFixed(2);
        return `
            <tr>
                <td style="font-size:11px;padding:2px 0;">${p.methodLabel || 'Pago'}</td>
                <td style="font-size:11px;font-weight:bold;text-align:right;padding:2px 0;">${val}</td>
            </tr>`;
    }).join('');

    const fiadoRate = bcvRate || rate;
    const fiadoHtml = hasFiado ? `
        <div style="margin-top:6px;padding:4px 0;border-top:1px dashed #ccc;">
            <table style="width:100%"><tr>
                <td style="color:#dc3545;font-weight:bold;font-size:11px;">Deuda pendiente:</td>
                <td style="color:#dc3545;font-weight:bold;font-size:11px;text-align:right;">$${sale.fiadoUsd.toFixed(2)}</td>
            </tr><tr>
                <td></td>
                <td style="color:#dc3545;font-size:9px;text-align:right;">Bs ${formatBs(sale.fiadoUsd * fiadoRate)} (tasa actual)</td>
            </tr></table>
        </div>` : '';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ticket #${saleNum}</title>
<style>
    @page {
        size: ${cssPageSize};
        margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
        font-family: 'Courier New', 'Lucida Console', monospace;
        width: ${cssBodyWidth};
        max-width: ${cssBodyWidth};
        margin: 0 auto;
        padding: 4mm 2mm;
        color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .dash {
        border: none;
        border-top: 1px dashed #555;
        margin: 6px 0;
    }
    .total-usd {
        font-size: ${fTotalU};
        font-weight: 900;
        color: #107c41;
        text-align: center;
        margin: 4px 0;
    }
    .total-bs {
        font-size: ${fTotalB};
        font-weight: bold;
        text-align: center;
        margin-bottom: 4px;
    }
    table { width: 100%; border-collapse: collapse; }
    @media print {
        body { width: ${cssBodyWidth}; max-width: ${cssBodyWidth}; }
    }
    @media screen {
        body {
            border: 1px solid #ccc;
            margin-top: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
    }
</style>
</head>
<body>
    <!-- Logo -->
    <div class="center" style="margin-bottom:6px;">
        <img src="/logo-ticket.png" alt="Logo" style="max-width:${cssLogoW};max-height:16mm;" onerror="this.style.display='none'">
    </div>

    <!-- Info del Negocio -->
    <div class="center" style="margin-bottom:6px;line-height:1.2;">
        ${settings.name ? `<div class="bold" style="font-size:${fTitle};text-transform:uppercase;">${settings.name}</div>` : ''}
        ${settings.rif ? `<div style="font-size:${fTiny};">RIF: ${settings.rif}</div>` : ''}
        ${settings.address ? `<div style="font-size:${fTiny};">${settings.address}</div>` : ''}
        ${settings.phone ? `<div style="font-size:${fTiny};">Tel: ${settings.phone}</div>` : ''}
        ${settings.instagram ? `<div style="font-size:${fTiny};">Ig: ${settings.instagram}</div>` : ''}
    </div>

    <hr class="dash">

    <!-- Info -->
    <table>
        <tr>
            <td style="font-size:${fSmall};font-weight:bold;">N: #${saleNum}</td>
            <td style="font-size:${fTiny};color:#555;text-align:right;">${fecha} ${hora}</td>
        </tr>
    </table>
    <div style="font-size:${fSmall};margin:3px 0 2px;">
        <span style="font-weight:bold;">Cliente:</span> ${capitalizeName(sale.customerName) || 'Consumidor Final'}
    </div>
    ${sale.tableName ? `<div style="font-size:${fSmall};margin:2px 0;"><span style="font-weight:bold;">Mesa:</span> ${sale.tableName}</div>` : ''}
    ${sale.customerDocument ? `<div style="font-size:${fTiny};color:#555;">C.I/RIF: ${sale.customerDocument}</div>` : ''}
    ${(sale.meseroNombre || sale.vendedorNombre) && (sale.meseroNombre || sale.vendedorNombre) !== 'Sistema' ? `<div style="font-size:${fTiny};color:#555;"><span style="font-weight:bold;">Atendido:</span> ${capitalizeName(sale.meseroNombre || sale.vendedorNombre)}</div>` : ''}

    <hr class="dash">

    <!-- Productos Header -->
    <table style="margin-bottom:4px;">
        <tr style="font-size:${fTiny};color:#777;font-weight:bold;">
            <td style="text-align:left;">CANT</td>
            <td style="text-align:left;">DESCRIPCION</td>
            <td style="text-align:right;">IMPORTE</td>
        </tr>
    </table>

    <!-- Productos -->
    <table>${itemsHtml}</table>

    <hr class="dash">

    <!-- Tasa -->
    <div class="center" style="font-size:${fTiny};color:#555;margin:4px 0;">
        <div style="margin-bottom:2px;">Tasa BCV: Bs ${formatBs(rate)} por $1</div>
        ${sale.tasaCop > 0 ? `<div>Tasa COP: ${sale.tasaCop.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por $1</div>` : ''}
    </div>

    <!-- Total -->
    <div style="margin:8px 0;">
        ${sale.discountAmountUsd > 0 ? `
        <table style="margin-bottom:6px; font-size:${fTiny}; border-bottom: 1px dashed #ccc; padding-bottom: 4px;">
            <tr>
                <td style="text-align:left; color:#555; font-weight:bold;">SUBTOTAL:</td>
                <td style="text-align:right; color:#555; font-weight:bold;">$${sale.cartSubtotalUsd?.toFixed(2) || (sale.totalUsd + sale.discountAmountUsd).toFixed(2)}</td>
            </tr>
            <tr>
                <td style="text-align:left; color:#dc3545; font-weight:bold;">${sale.discountType === 'percentage' ? `DESCUENTO (${sale.discountValue}%):` : 'DESCUENTO:'}</td>
                <td style="text-align:right; color:#dc3545; font-weight:bold;">-$${sale.discountAmountUsd.toFixed(2)}</td>
            </tr>
        </table>
        ` : ''}
        <div class="center bold" style="font-size:${fSmall};color:#555;margin-bottom:4px;">TOTAL A PAGAR</div>
        <div class="total-usd">$${parseFloat(sale.totalUsd || 0).toFixed(2)}</div>
        <div class="total-bs" style="margin-bottom:${sale.copEnabled && sale.tasaCop > 0 ? '2px' : '4px'}">Bs ${formatBs(sale.totalBs || 0)}</div>
        ${sale.copEnabled && sale.tasaCop > 0 ? `<div class="total-bs" style="font-size:13px;">COP ${(sale.totalCop || (sale.totalUsd * sale.tasaCop)).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>` : ''}
    </div>

    <hr class="dash">

    <!-- Pagos -->
    ${(sale.payments && sale.payments.length > 0) || hasFiado ? `
    <div style="margin:4px 0;">
        <div style="font-size:${fTiny};color:#777;font-weight:bold;margin-bottom:4px;">PAGOS REALIZADOS</div>
        <table>${paymentsHtml}</table>
        ${fiadoHtml}
    </div>
    <hr class="dash">
    ` : ''}

    <!-- Pie -->
    <div class="center bold" style="font-size:${fBase};margin:8px 0 4px;">Gracias por tu compra!</div>
    <div class="center" style="font-size:${fDisclaimer};color:#888;margin-top:4px;line-height:1.4;">Este documento no constituye factura fiscal.<br>Comprobante de control interno sin validez tributaria.</div>
</body>
</html>`;

    _openAndPrint(html);
}

/**
 * Abre ventana de impresión, mide el contenido real y ajusta @page antes de imprimir.
 * Esto evita el papel en blanco extra que genera el driver POS-58 con tamaños fijos.
 */
function _openAndPrint(html) {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        // Fallback: iframe oculto
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:58mm;height:auto;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        iframe.onload = () => {
            setTimeout(() => {
                _adjustPageSizeAndPrint(iframe.contentWindow, iframe.contentDocument);
                setTimeout(() => document.body.removeChild(iframe), 2000);
            }, 300);
        };
        return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
        setTimeout(() => {
            _adjustPageSizeAndPrint(printWindow, printWindow.document);
        }, 400);
    };

    // Fallback si onload no dispara
    setTimeout(() => {
        try {
            _adjustPageSizeAndPrint(printWindow, printWindow.document);
        } catch(_) { /* ignore */ }
    }, 1500);
}

/**
 * Mide la altura real del contenido y reescribe @page con esa altura exacta.
 */
function _adjustPageSizeAndPrint(win, doc) {
    try {
        const body = doc.body;
        const contentH = body.scrollHeight;
        // Convertir px a mm (96 DPI: 1mm ≈ 3.7795px)
        const heightMm = Math.ceil(contentH / 3.7795) + 2; // +2mm margen de seguridad
        const style = doc.createElement('style');
        style.textContent = `@page { size: 58mm ${heightMm}mm !important; margin: 0 !important; }`;
        doc.head.appendChild(style);
    } catch(_) { /* si falla la medición, imprime con auto */ }
    win.print();
}
