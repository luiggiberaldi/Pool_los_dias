import { jsPDF } from 'jspdf';
import { formatBs } from './calculatorUtils';
import { getPaymentLabel, toTitleCase } from '../config/paymentMethods';

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
            doc.text('POOL LOS DIAS — REPORTE DETALLADO DE CIERRE (Continuación)', M_LEFT, y);
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
    // Logo opcional
    try {
        const img = new Image();
        img.src = '/logo-ticket.png';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        const logoW = 28;
        const logoH = logoW * (img.height / img.width);
        doc.addImage(img, 'PNG', M_LEFT, y, logoW, logoH);
    } catch (_) { /* logo opcional */ }

    // Título y Datos Empresa
    const headerTextX = M_LEFT + 34;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('POOL LOS DIAS', headerTextX, y + 5);

    doc.setFontSize(10);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('REPORTE ADMINISTRATIVO DE CIERRE DE CAJA', headerTextX, y + 10);

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

    y += 20;
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
    let totalHoursCount = 0;
    let totalHoursUsd = 0;

    allSales.forEach(s => {
        if (s.status === 'ANULADA') return;
        (s.items || []).forEach(item => {
            if (item.category === 'servicios') {
                const nameLower = (item.name || '').toLowerCase();
                if (nameLower.includes('piña') || nameLower.includes('pina')) {
                    totalPinasCount += (item.qty || 1);
                    totalPinasUsd += (item.priceUsd || 0) * (item.qty || 1);
                } else if (nameLower.includes('tiempo') || nameLower.includes('hora')) {
                    totalHoursCount += (item.qty || 1);
                    totalHoursUsd += (item.priceUsd || 0) * (item.qty || 1);
                }
            }
        });
    });

    const totalPoolServicesUsd = totalPinasUsd + totalHoursUsd;

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
        { label: 'TIEMPO DE JUEGO (HORAS)', value: `${totalHoursCount} registros`, sub: `$${totalHoursUsd.toFixed(2)} · Bs ${formatBs(totalHoursUsd * bcvRate)}` },
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
    // 5. TOP PRODUCTOS MÁS VENDIDOS
    // ════════════════════════════════════
    if (topProducts && topProducts.length > 0) {
        checkAddPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLOR_PRIMARY);
        doc.text('5. PRODUCTOS MÁS VENDIDOS', M_LEFT, y);
        y += 4;

        doc.setFillColor(...COLOR_PRIMARY);
        doc.rect(M_LEFT, y, CONTENT_W, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text('#', M_LEFT + 3, y + 3.5);
        doc.text('Producto', M_LEFT + 12, y + 3.5);
        doc.text('Cantidad Vendida', M_LEFT + 100, y + 3.5, { align: 'right' });
        doc.text('Ingreso USD', M_LEFT + 145, y + 3.5, { align: 'right' });
        doc.text('Ingreso Bs (Ref)', M_LEFT + CONTENT_W - 3, y + 3.5, { align: 'right' });
        y += 5;

        topProducts.forEach((p, i) => {
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
            const pName = p.name.length > 45 ? p.name.substring(0, 45) + '…' : p.name;
            doc.text(pName, M_LEFT + 12, y + 3.5);

            doc.setFont('helvetica', 'bold');
            doc.text(`${p.qty} u`, M_LEFT + 100, y + 3.5, { align: 'right' });
            doc.text(`$${p.revenue.toFixed(2)}`, M_LEFT + 145, y + 3.5, { align: 'right' });
            doc.text(`Bs ${formatBs(p.revenue * bcvRate)}`, M_LEFT + CONTENT_W - 3, y + 3.5, { align: 'right' });
            y += 5;
        });

        y += 6;
    }

    // ════════════════════════════════════
    // 6. DETALLE COMPLETO DE OPERACIONES
    // ════════════════════════════════════
    checkAddPage(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('6. DETALLE COMPLETO DE OPERACIONES Y VENTAS', M_LEFT, y);
    y += 4;

    // Header Tabla Ventas
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(M_LEFT, y, CONTENT_W, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('Hora', M_LEFT + 3, y + 3.5);
    doc.text('Ref / Cliente', M_LEFT + 22, y + 3.5);
    doc.text('Tipo', M_LEFT + 85, y + 3.5);
    doc.text('Método Pago', M_LEFT + 115, y + 3.5);
    doc.text('Estado', M_LEFT + 148, y + 3.5);
    doc.text('Total ($)', M_LEFT + 172, y + 3.5, { align: 'right' });
    doc.text('Total (Bs)', M_LEFT + CONTENT_W - 3, y + 3.5, { align: 'right' });
    y += 5;

    if (allSales.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_MUTED);
        doc.text('No hay operaciones registradas en este período', M_LEFT + 3, y + 4);
        y += 6;
    } else {
        allSales.forEach((s, idx) => {
            checkAddPage(6);
            const isAlt = idx % 2 === 1;
            if (isAlt) {
                doc.setFillColor(...COLOR_LIGHT_BG);
                doc.rect(M_LEFT, y, CONTENT_W, 5, 'F');
            }

            const d = new Date(s.timestamp);
            const horaStr = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
            const isCanceled = s.status === 'ANULADA';
            const clienteStr = s.customerName || 'Consumidor Final';
            const saleNum = s.saleNumber ? `#${String(s.saleNumber).padStart(6, '0')}` : s.id.substring(0, 8);
            const refClient = `${saleNum} · ${clienteStr.length > 25 ? clienteStr.substring(0, 25) + '…' : clienteStr}`;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...COLOR_TEXT);
            doc.text(horaStr, M_LEFT + 3, y + 3.5);
            doc.text(refClient, M_LEFT + 22, y + 3.5);

            doc.text(s.tipo || 'VENTA', M_LEFT + 85, y + 3.5);

            // Método Pago
            let payStr = 'Varios';
            if (s.payments && s.payments.length === 1) {
                payStr = toTitleCase(s.payments[0].methodLabel || getPaymentLabel(s.payments[0].methodId));
            } else if (s.paymentMethod) {
                payStr = getPaymentLabel(s.paymentMethod);
            }
            doc.text(payStr.length > 18 ? payStr.substring(0, 18) + '…' : payStr, M_LEFT + 115, y + 3.5);

            // Estado
            doc.setFont('helvetica', 'bold');
            if (isCanceled) {
                doc.setTextColor(...COLOR_RED);
                doc.text('ANULADA', M_LEFT + 148, y + 3.5);
            } else {
                doc.setTextColor(...COLOR_GREEN);
                doc.text('COMPLETADA', M_LEFT + 148, y + 3.5);
            }

            // Totales
            doc.setTextColor(...COLOR_TEXT);
            const totalUsdStr = isCanceled ? '$0.00' : `$${(s.totalUsd || 0).toFixed(2)}`;
            const totalBsStr = isCanceled ? '0.00 Bs' : `Bs ${formatBs(s.totalBs || 0)}`;

            doc.text(totalUsdStr, M_LEFT + 172, y + 3.5, { align: 'right' });
            doc.text(totalBsStr, M_LEFT + CONTENT_W - 3, y + 3.5, { align: 'right' });
            y += 5;
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

        doc.text('Pool Los Dias — Documento generado automáticamente (Sin valor fiscal)', M_LEFT, PAGE_H - 7);
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
