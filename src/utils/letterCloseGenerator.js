import { jsPDF } from 'jspdf';
import { formatBs } from './calculatorUtils';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';

/**
 * Helper de Detección Dual para identificar Servicios de Mesa / Pool
 * (piñas, partidas, tiempo de juego, adicionales compartidos)
 */
export function isPoolServiceItem(item) {
    if (!item) return false;
    if (item.category === 'servicios') return true;
    const nameLower = (item.name || '').toLowerCase().trim();
    return (
        nameLower.startsWith('tiempo') ||
        nameLower.startsWith('piña') ||
        nameLower.startsWith('pina') ||
        nameLower.startsWith('partida') ||
        nameLower.startsWith('compartido') ||
        nameLower.includes('mesa ')
    );
}

/**
 * Parsea las horas jugadas acumuladas de un ítem de servicio de tiempo
 */
export function parseHoursFromItem(item) {
    if (!item) return 0;
    if (typeof item.hours === 'number' && item.hours > 0) {
        return item.hours * (item.qty || 1);
    }
    if (typeof item.durationMinutes === 'number' && item.durationMinutes > 0) {
        return (item.durationMinutes / 60) * (item.qty || 1);
    }
    const name = item.name || '';
    const qty = item.qty || 1;

    if (name.includes('1/2')) return 0.5 * qty;
    if (name.includes('1/4')) return 0.25 * qty;
    if (name.includes('3/4')) return 0.75 * qty;

    const hMatch = name.match(/\((\d+(?:\.\d+)?)\s*h\)/i);
    if (hMatch) {
        return parseFloat(hMatch[1]) * qty;
    }

    const mMatch = name.match(/\((\d+)\s*min\)/i);
    if (mMatch) {
        return (parseFloat(mMatch[1]) / 60) * qty;
    }

    return qty;
}

/**
 * Genera un PDF de Cierre del Día / Turno en Formato Carta (Letter Size: 215.9mm x 279.4mm)
 * Incluye encabezado institucional, resumen general, resumen de pool (horas y piñas),
 * desglose por métodos de pago, reconciliación de caja física, top productos y detalle completo de operaciones.
 */
export async function generateDailyCloseLetterPDF({
    sales,           // Ventas del período (flujo de caja / sin anuladas)
    allSales,        // Todas las ventas (para métricas e incluye anuladas para auditoría)
    bcvRate,
    paymentBreakdown,
    topProducts,
    todayTotalUsd,
    todayTotalBs,
    todayProfit,
    todayItemsSold,
    reconData,       // Datos de cuadre físico (opcional)
    apertura,        // Registro de apertura (opcional)
    sellerName,      // Cajero responsable
    periodLabel,     // Ej: "Turno Actual", "Hoy", "Esta Semana"
}) {
    const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
    
    // Dimensiones Letter (8.5" x 11" = 215.9mm x 279.4mm)
    const PAGE_W = 215.9;
    const PAGE_H = 279.4;
    const M_LEFT = 14;
    const M_RIGHT = 14;
    const M_TOP = 14;
    const M_BOTTOM = 18;
    const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT; // 187.9mm

    // Paleta de Colores
    const COLOR_PRIMARY = [49, 46, 129];     // Indigo 900
    const COLOR_ACCENT = [79, 70, 229];      // Indigo 600
    const COLOR_TEXT = [30, 41, 59];         // Slate 800
    const COLOR_MUTED = [100, 116, 139];     // Slate 500
    const COLOR_LIGHT_BG = [248, 250, 252];  // Slate 50
    const COLOR_BORDER = [226, 232, 240];    // Slate 200
    const COLOR_GREEN = [16, 185, 129];      // Emerald 500
    const COLOR_RED = [239, 68, 68];         // Red 500

    let y = M_TOP;

    // Helper: Nueva página con encabezado simplificado
    const checkAddPage = (neededHeight) => {
        if (y + neededHeight > PAGE_H - M_BOTTOM) {
            doc.addPage();
            y = M_TOP;
            // Mini Header en páginas subsiguientes
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...COLOR_MUTED);
            doc.text('POOL LOS DIAZ — REPORTE DETALLADO DE CIERRE (Continuación)', M_LEFT, y);
            doc.setFont('helvetica', 'normal');
            doc.text(new Date().toLocaleDateString('es-VE'), PAGE_W - M_RIGHT, y, { align: 'right' });
            y += 5;
            doc.setDrawColor(...COLOR_BORDER);
            doc.setLineWidth(0.3);
            doc.line(M_LEFT, y, PAGE_W - M_RIGHT, y);
            y += 6;
        }
    };

    // ════════════════════════════════════
    // 1. ENCABEZADO INSTITUCIONAL
    // ════════════════════════════════════
    let logoH = 0;
    try {
        const img = new Image();
        img.src = '/logo-ticket.png';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const logoW = 26;
        logoH = logoW * (img.height / img.width);
        doc.addImage(img, 'PNG', M_LEFT, y - 2, logoW, logoH);
    } catch (_) { /* logo opcional */ }

    // Título y Datos Empresa
    const headerTextX = M_LEFT + 32;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('POOL LOS DIAZ', headerTextX, y + 4);

    doc.setFontSize(10);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('REPORTE ADMINISTRATIVO DE CIERRE DE CAJA', headerTextX, y + 9);

    // Bloque derecho: Fecha, Emisión, Tasa
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR_TEXT);
    doc.text(`Fecha Emisión: ${dateStr} ${timeStr}`, PAGE_W - M_RIGHT, y + 3, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`Período / Filtro: ${periodLabel || 'Turno Actual'}`, PAGE_W - M_RIGHT, y + 7, { align: 'right' });
    if (sellerName) doc.text(`Cajero: ${sellerName}`, PAGE_W - M_RIGHT, y + 11, { align: 'right' });
    doc.text(`Tasa Aplicada: Bs ${formatBs(bcvRate)} / $1`, PAGE_W - M_RIGHT, y + 15, { align: 'right' });

    // Ajustar Y dinámicamente según la altura del logo para evitar solapamientos
    y += Math.max(logoH + 2, 22);
    doc.setDrawColor(...COLOR_PRIMARY);
    doc.setLineWidth(0.8);
    doc.line(M_LEFT, y, PAGE_W - M_RIGHT, y);
    y += 6;

    // ════════════════════════════════════
    // 2. RESUMEN FINANCIERO Y MÉTRICAS
    // ════════════════════════════════════
    checkAddPage(28);
    
    // Título de Sección
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('1. RESUMEN GENERAL DE OPERACIONES', M_LEFT, y);
    y += 4;

    const metricsBoxW = (CONTENT_W - 9) / 4;
    const metricsBoxH = 18;
    const metricsData = [
        { label: 'OPERACIONES', value: `${sales.length} ventas`, sub: `${todayItemsSold} artículos` },
        { label: 'INGRESOS TOTAL (USD)', value: `$${todayTotalUsd.toFixed(2)}`, sub: `Ref: Bs ${formatBs(todayTotalBs)}` },
        { label: 'GANANCIA EST. (USD)', value: `$${(todayProfit / bcvRate).toFixed(2)}`, sub: `Bs ${formatBs(todayProfit)}` },
        { label: 'FONDO INICIAL', value: apertura ? `$${(apertura.openingUsd || 0).toFixed(2)}` : '$0.00', sub: apertura ? `Bs ${formatBs(apertura.openingBs || 0)}` : 'Sin registro' }
    ];

    metricsData.forEach((m, idx) => {
        const boxX = M_LEFT + idx * (metricsBoxW + 3);
        doc.setFillColor(...COLOR_LIGHT_BG);
        doc.setDrawColor(...COLOR_BORDER);
        doc.setLineWidth(0.3);
        doc.roundedRect(boxX, y, metricsBoxW, metricsBoxH, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(m.label, boxX + 4, y + 4.5);

        doc.setFontSize(9);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(m.value, boxX + 4, y + 10.5);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLOR_MUTED);
        doc.text(m.sub, boxX + 4, y + 15);
    });

    y += metricsBoxH + 6;

    // ════════════════════════════════════
    // 3. CÁLCULO DE SERVICIOS DE POOL (HORAS Y PIÑAS)
    // ════════════════════════════════════
    let totalPinasCount = 0;
    let totalPinasUsd = 0;
    let totalHoursPlayed = 0;
    let totalHoursUsd = 0;

    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        (s.items || []).forEach(item => {
            if (isPoolServiceItem(item)) {
                const nameLower = (item.name || '').toLowerCase();
                if (nameLower.includes('piña') || nameLower.includes('pina') || nameLower.includes('partida')) {
                    totalPinasCount += (item.qty || 1);
                    totalPinasUsd += (item.priceUsd || 0) * (item.qty || 1);
                } else {
                    totalHoursPlayed += parseHoursFromItem(item);
                    totalHoursUsd += (item.priceUsd || 0) * (item.qty || 1);
                }
            }
        });
    });

    const totalPoolServicesUsd = totalPinasUsd + totalHoursUsd;
    const hoursDisplayStr = totalHoursPlayed % 1 === 0 ? `${totalHoursPlayed} hrs` : `${totalHoursPlayed.toFixed(1)} hrs`;

    checkAddPage(32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('2. RESUMEN DE SERVICIOS DE POOL (TIEMPO Y PIÑAS)', M_LEFT, y);
    y += 4;

    const poolBoxW = (CONTENT_W - 6) / 3;
    const poolBoxH = 18;
    const poolMetricsData = [
        { label: 'PARTIDAS / PIÑAS JUGADAS', value: `${totalPinasCount} piñas`, sub: `$${totalPinasUsd.toFixed(2)} · Bs ${formatBs(totalPinasUsd * bcvRate)}` },
        { label: 'TIEMPO DE JUEGO (HORAS)', value: hoursDisplayStr, sub: `$${totalHoursUsd.toFixed(2)} · Bs ${formatBs(totalHoursUsd * bcvRate)}` },
        { label: 'TOTAL SERVICIOS MESAS', value: `$${totalPoolServicesUsd.toFixed(2)}`, sub: `Bs ${formatBs(totalPoolServicesUsd * bcvRate)}` }
    ];

    poolMetricsData.forEach((m, idx) => {
        const boxX = M_LEFT + idx * (poolBoxW + 3);
        doc.setFillColor(238, 242, 255); // Indigo 50
        doc.setDrawColor(199, 210, 254); // Indigo 200
        doc.setLineWidth(0.3);
        doc.roundedRect(boxX, y, poolBoxW, poolBoxH, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...COLOR_ACCENT);
        doc.text(m.label, boxX + 4, y + 4.5);

        doc.setFontSize(9.5);
        doc.setTextColor(...COLOR_PRIMARY);
        doc.text(m.value, boxX + 4, y + 10.5);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLOR_TEXT);
        doc.text(m.sub, boxX + 4, y + 15);
    });

    y += poolBoxH + 6;

    // ════════════════════════════════════
    // 4. DESGLOSE POR MÉTODO DE PAGO Y CUADRE FISICO
    // ════════════════════════════════════
    checkAddPage(40);
    const col2Width = (CONTENT_W - 6) / 2;

    // Tabla Pagos (Columna Izquierda)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('3. DESGLOSE DE INGRESOS POR METODO DE PAGO', M_LEFT, y);

    // Tabla Cuadre Físico (Columna Derecha)
    doc.text('4. CUADRE DE CAJA FISICA', M_LEFT + col2Width + 6, y);
    y += 5;

    let yLeft = y;
    let yRight = y;

    // Left Table Header
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(M_LEFT, yLeft, col2Width, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('Método', M_LEFT + 3, yLeft + 3.5);
    doc.text('Moneda', M_LEFT + col2Width - 30, yLeft + 3.5);
    doc.text('Monto Ingresado', M_LEFT + col2Width - 3, yLeft + 3.5, { align: 'right' });
    yLeft += 5;

    const paymentEntries = Object.entries(paymentBreakdown || {});
    if (paymentEntries.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_MUTED);
        doc.text('Sin movimientos de pago registrados', M_LEFT + 3, yLeft + 4);
        yLeft += 6;
    } else {
        paymentEntries.forEach(([methodId, data], i) => {
            const label = toTitleCase(getPaymentLabel(methodId, data.label));
            const isAlt = i % 2 === 1;
            if (isAlt) {
                doc.setFillColor(...COLOR_LIGHT_BG);
                doc.rect(M_LEFT, yLeft, col2Width, 5, 'F');
            }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...COLOR_TEXT);
            doc.text(label, M_LEFT + 3, yLeft + 3.5);
            doc.text(data.currency, M_LEFT + col2Width - 30, yLeft + 3.5);

            const valStr = (data.currency === 'USD' || data.currency === 'FIADO')
                ? `$${data.total.toFixed(2)}`
                : data.currency === 'COP'
                ? `COP ${data.total.toLocaleString('es-CO')}`
                : `Bs ${formatBs(data.total)}`;

            doc.setFont('helvetica', 'bold');
            doc.text(valStr, M_LEFT + col2Width - 3, yLeft + 3.5, { align: 'right' });
            yLeft += 5;
        });
    }

    // Right Table: Cuadre Físico
    const rightX = M_LEFT + col2Width + 6;
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(rightX, yRight, col2Width, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('Concepto Reconciliación', rightX + 3, yRight + 3.5);
    doc.text('Valor', rightX + col2Width - 3, yRight + 3.5, { align: 'right' });
    yRight += 5;

    const reconRows = reconData ? [
        ['Declarado Efectivo USD', `$${reconData.declaredUsd.toFixed(2)}`],
        ['Declarado Efectivo Bs', `Bs ${formatBs(reconData.declaredBs)}`],
        ['Diferencia Cuadre USD', `$${reconData.diffUsd.toFixed(2)}`],
        ['Diferencia Cuadre Bs', `Bs ${formatBs(reconData.diffBs)}`]
    ] : [
        ['Declarado Efectivo USD', 'No registrado'],
        ['Declarado Efectivo Bs', 'No registrado'],
        ['Diferencia USD', '$0.00'],
        ['Diferencia Bs', '0.00 Bs']
    ];

    reconRows.forEach(([lbl, val], i) => {
        const isAlt = i % 2 === 1;
        if (isAlt) {
            doc.setFillColor(...COLOR_LIGHT_BG);
            doc.rect(rightX, yRight, col2Width, 5, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(lbl, rightX + 3, yRight + 3.5);

        doc.setFont('helvetica', 'bold');
        if (reconData && i >= 2) {
            const diffVal = i === 2 ? reconData.diffUsd : reconData.diffBs;
            if (Math.abs(diffVal) <= (i === 2 ? 0.05 : 1)) doc.setTextColor(...COLOR_MUTED);
            else if (diffVal < 0) doc.setTextColor(...COLOR_RED);
            else doc.setTextColor(...COLOR_GREEN);
        } else {
            doc.setTextColor(...COLOR_TEXT);
        }
        doc.text(val, rightX + col2Width - 3, yRight + 3.5, { align: 'right' });
        yRight += 5;
    });

    y = Math.max(yLeft, yRight) + 6;

    // ════════════════════════════════════
    // 5. RESUMEN COMPLETO DE PRODUCTOS Y ARTÍCULOS VENDIDOS
    // ════════════════════════════════════
    const allProductsMap = {};
    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        (s.items || []).forEach(item => {
            if (isPoolServiceItem(item)) return; // Excluir servicios de mesa
            const key = item.name;
            if (!allProductsMap[key]) {
                allProductsMap[key] = {
                    name: item.name,
                    qty: 0,
                    revenue: 0,
                    isWeight: !!item.isWeight
                };
            }
            allProductsMap[key].qty += (item.qty || 0);
            allProductsMap[key].revenue += (item.priceUsd || 0) * (item.qty || 0);
        });
    });

    const allProductsList = Object.values(allProductsMap)
        .sort((a, b) => b.qty - a.qty);

    if (allProductsList.length > 0) {
        checkAddPage(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLOR_PRIMARY);
        doc.text('5. RESUMEN COMPLETO DE PRODUCTOS Y ARTÍCULOS VENDIDOS', M_LEFT, y);
        y += 4;

        doc.setFillColor(...COLOR_PRIMARY);
        doc.rect(M_LEFT, y, CONTENT_W, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text('#', M_LEFT + 3, y + 3.5);
        doc.text('Producto / Servicio', M_LEFT + 12, y + 3.5);
        doc.text('Cantidad Total', M_LEFT + 100, y + 3.5, { align: 'right' });
        doc.text('Ingreso USD', M_LEFT + 145, y + 3.5, { align: 'right' });
        doc.text('Ingreso Bs (Ref)', M_LEFT + CONTENT_W - 3, y + 3.5, { align: 'right' });
        y += 5;

        allProductsList.forEach((p, i) => {
            checkAddPage(5.5);
            const isAlt = i % 2 === 1;
            if (isAlt) {
                doc.setFillColor(...COLOR_LIGHT_BG);
                doc.rect(M_LEFT, y, CONTENT_W, 5, 'F');
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...COLOR_TEXT);
            doc.text(`${i + 1}.`, M_LEFT + 3, y + 3.5);

            doc.setFont('helvetica', 'normal');
            doc.text(p.name, M_LEFT + 12, y + 3.5);

            const qtyLabel = p.isWeight ? `${p.qty.toFixed(2)} kg` : `${p.qty} u`;
            doc.setFont('helvetica', 'bold');
            doc.text(qtyLabel, M_LEFT + 100, y + 3.5, { align: 'right' });
            doc.text(`$${p.revenue.toFixed(2)}`, M_LEFT + 145, y + 3.5, { align: 'right' });
            doc.text(`Bs ${formatBs(p.revenue * bcvRate)}`, M_LEFT + CONTENT_W - 3, y + 3.5, { align: 'right' });
            y += 5;
        });

        y += 6;
    }

    // ════════════════════════════════════
    // 6. DETALLE COMPLETO DE OPERACIONES Y VENTAS
    // ════════════════════════════════════
    checkAddPage(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('6. DETALLE COMPLETO DE OPERACIONES Y VENTAS', M_LEFT, y);
    y += 6;

    if (allSales.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_MUTED);
        doc.text('No hay operaciones registradas en este período', M_LEFT + 3, y + 4);
        y += 8;
    } else {
        allSales.forEach((s, idx) => {
            const isCanceled = s.status === 'ANULADA';
            const items = s.items || [];
            const payments = s.payments || [];
            const hasChange = (s.changeUsd && s.changeUsd > 0) || (s.changeBs && s.changeBs > 0);
            const hasDiscount = s.discountAmountUsd && s.discountAmountUsd > 0;

            // Estimar altura del bloque de venta
            const blockHeight = 12 
                + (!isCanceled ? items.length * 4.5 : 0)
                + (!isCanceled && payments.length > 0 ? payments.length * 4 : (!isCanceled ? 4 : 0))
                + (hasChange ? 4 : 0)
                + (hasDiscount ? 4 : 0)
                + 6;

            checkAddPage(blockHeight);

            // Fondo del bloque de la venta
            doc.setFillColor(isCanceled ? 254 : (idx % 2 === 1 ? 248 : 255), isCanceled ? 242 : (idx % 2 === 1 ? 250 : 255), isCanceled ? 242 : (idx % 2 === 1 ? 252 : 255));
            doc.setDrawColor(isCanceled ? 252 : 226, isCanceled ? 165 : 232, isCanceled ? 165 : 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(M_LEFT, y, CONTENT_W, blockHeight - 3, 1.5, 1.5, 'FD');

            let cardY = y + 4;

            // Linea 1: Encabezado de Venta (Hora, Factura, Cliente, Vendedor/Mesa, Estado, Total)
            const d = new Date(s.timestamp);
            const horaStr = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
            const saleNum = s.saleNumber ? `#${String(s.saleNumber).padStart(6, '0')}` : s.id.substring(0, 8);
            const clienteStr = s.customerName || 'Consumidor Final';
            const sellerStr = s.sellerName || s.userName || s.cajero || null;
            const mesaStr = s.tableName || null;

            let infoMeta = `${horaStr}  |  ${saleNum}  |  Cliente: ${clienteStr}`;
            if (mesaStr) infoMeta += `  |  Mesa: ${mesaStr}`;
            if (sellerStr) infoMeta += `  |  Atendido por: ${sellerStr}`;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...COLOR_PRIMARY);
            doc.text(infoMeta, M_LEFT + 4, cardY);

            // Total / Estado al lado derecho
            if (isCanceled) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(...COLOR_RED);
                doc.text('ANULADA  ·  $0.00', PAGE_W - M_RIGHT - 4, cardY, { align: 'right' });
            } else {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...COLOR_GREEN);
                const totUsd = (s.totalUsd || 0).toFixed(2);
                const totBs = formatBs(s.totalBs || 0);
                doc.text(`$${totUsd}  (Bs ${totBs})`, PAGE_W - M_RIGHT - 4, cardY, { align: 'right' });
            }

            cardY += 4.5;
            doc.setDrawColor(...COLOR_BORDER);
            doc.setLineWidth(0.2);
            doc.line(M_LEFT + 3, cardY - 1, PAGE_W - M_RIGHT - 3, cardY - 1);
            cardY += 2;

            // Línea 2: Productos Vendidos (sin recortar nombre)
            if (!isCanceled && items.length > 0) {
                items.forEach(item => {
                    const qtyStr = item.isWeight ? `${item.qty.toFixed(2)}kg` : `${item.qty}u`;
                    const unitPrice = (item.priceUsd || 0).toFixed(2);
                    const itemTotal = ((item.priceUsd || 0) * item.qty).toFixed(2);
                    const itemTotalBs = formatBs((item.priceUsd || 0) * item.qty * (s.bcvRate || bcvRate));

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(...COLOR_TEXT);
                    doc.text(`• ${qtyStr}  ${item.name}`, M_LEFT + 6, cardY);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(...COLOR_MUTED);
                    doc.text(`@ $${unitPrice}  =  $${itemTotal}  (Bs ${itemTotalBs})`, PAGE_W - M_RIGHT - 4, cardY, { align: 'right' });
                    cardY += 4.5;
                });
            }

            // Línea 3: Desglose de Métodos de Pago
            if (!isCanceled && payments.length > 0) {
                payments.forEach(p => {
                    const payLabel = toTitleCase(p.methodLabel || getPaymentLabel(p.methodId) || 'Pago');
                    let payVal = `$${(p.amountUsd !== undefined ? p.amountUsd : p.amount).toFixed(2)}`;
                    if (p.currency === 'BS') payVal = `Bs ${formatBs(p.amountBs !== undefined ? p.amountBs : p.amount)}`;
                    else if (p.currency === 'COP') payVal = `${(p.amount || 0).toLocaleString('es-CO')} COP`;

                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(6.5);
                    doc.setTextColor(...COLOR_MUTED);
                    doc.text(`   [Pago recibido: ${payLabel} → ${payVal}]`, M_LEFT + 6, cardY);
                    cardY += 4;
                });
            } else if (!isCanceled && s.paymentMethod) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(6.5);
                doc.setTextColor(...COLOR_MUTED);
                doc.text(`   [Pago recibido: ${getPaymentLabel(s.paymentMethod)}]`, M_LEFT + 6, cardY);
                cardY += 4;
            }

            // Línea 4: Vuelto / Cambio Entregado
            if (!isCanceled && hasChange) {
                let changeStr = '   [Vuelto entregado: ';
                if (s.changeUsd > 0) changeStr += `$${s.changeUsd.toFixed(2)}`;
                if (s.changeBs > 0 && s.changeUsd > 0) changeStr += ' + ';
                if (s.changeBs > 0) changeStr += `Bs ${formatBs(s.changeBs)}`;
                changeStr += ']';

                doc.setFont('helvetica', 'italic');
                doc.setFontSize(6.5);
                doc.setTextColor(...COLOR_MUTED);
                doc.text(changeStr, M_LEFT + 6, cardY);
                cardY += 4;
            }

            // Línea 5: Descuento Aplicado
            if (!isCanceled && hasDiscount) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(6.5);
                doc.setTextColor(...COLOR_RED);
                doc.text(`   [Descuento aplicado: -$${s.discountAmountUsd.toFixed(2)}]`, M_LEFT + 6, cardY);
                cardY += 4;
            }

            y += blockHeight;
        });
    }

    // ════════════════════════════════════
    // 7. PIE DE PÁGINA CON NÚMEROS DE PÁGINA
    // ════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_MUTED);
        doc.setDrawColor(...COLOR_BORDER);
        doc.setLineWidth(0.3);
        doc.line(M_LEFT, PAGE_H - 12, PAGE_W - M_RIGHT, PAGE_H - 12);

        doc.text('Pool Los Diaz — Documento generado automáticamente (Sin valor fiscal)', M_LEFT, PAGE_H - 7);
        doc.text(`Página ${i} de ${totalPages}`, PAGE_W - M_RIGHT, PAGE_H - 7, { align: 'right' });
    }

    // ── DESCARGA O COMPARTIR ──
    const getLocalISODate = (d = new Date()) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const dateFileStr = getLocalISODate(now);
    const filename = `cierre_carta_${dateFileStr}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: `Cierre Carta ${dateFileStr}`, files: [file] })
            .catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}
