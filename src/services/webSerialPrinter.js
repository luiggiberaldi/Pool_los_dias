/**
 * webSerialPrinter.js
 * Servicio de integración nativa con impresoras térmicas USB/Serial mediante Web Serial API.
 *
 * ESC/POS Comandos Básicos
 * Init: [27, 64]
 * Open Drawer: [27, 112, 0, 50, 250]
 */

import { capitalizeName } from '../utils/calculatorUtils';

let activePort = null;

export async function requestPrinterPort() {
    if (!('serial' in navigator)) {
        throw new Error('Web Serial API NO soportada en este navegador. Usa Chrome o Edge.');
    }

    try {
        const port = await navigator.serial.requestPort();
        activePort = port;
        return true;
    } catch (err) {
        if (err.name === 'NotFoundError') {
            throw new Error('Cancelaste la selección del puerto.');
        }
        throw err;
    }
}

export async function getConnectedPrinter() {
    if (!('serial' in navigator)) return null;

    try {
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
            // Usamos el primer puerto aprobado previamente
            activePort = ports[0];
            return activePort;
        }
        return null;
    } catch (err) {
        console.error('Error recuperando puertos', err);
        return null;
    }
}

export async function sendEscPosCommand(commandArray) {
    if (!activePort) {
        const port = await getConnectedPrinter();
        if (!port) throw new Error('No hay impresora conectada.');
    }

    try {
        if (!activePort.readable || !activePort.writable) {
            await activePort.open({ baudRate: 9600 }); // 9600 es estándar para impresoras seriales
        }

        const writer = activePort.writable.getWriter();
        const data = new Uint8Array(commandArray);
        await writer.write(data);
        writer.releaseLock();
        
        return true;
    } catch (err) {
        console.error('Web Serial Error:', err);
        throw new Error('Error al enviar el comando a la impresora: ' + err.message);
    }
}

export async function openCashDrawerWebSerial() {
    // ESC p m t1 t2
    // 27 = ESC, 112 = p, 0 = drawer 1, 50 = 50ms pulse, 250 = 250ms interval
    const ESC_POS_DRAWER = [27, 112, 0, 50, 250]; 
    return await sendEscPosCommand(ESC_POS_DRAWER);
}

export async function printTestWebSerial() {
    const text = '==== IMPRESORA CONECTADA ====\n\nImpresion de prueba via\nWeb Serial API (Chrome)\n\n\n\n\n\n============\n';
    const InitCmd = [27, 64]; 
    const CutCmd = [29, 86, 66, 0]; // GS V B 0
    
    // String to ArrayBuffer
    const encoder = new TextEncoder();
    const textBytes = Array.from(encoder.encode(text));

    const finalPayload = [...InitCmd, ...textBytes, ...CutCmd];
    
    return await sendEscPosCommand(finalPayload);
}

// Configuración local en storage (por si desactivan la apertura automática)
export function getWebSerialConfig() {
    try {
        const saved = localStorage.getItem('web_serial_config');
        return saved ? JSON.parse(saved) : { autoOpenDrawer: false };
    } catch {
        return { autoOpenDrawer: false };
    }
}

export function saveWebSerialConfig(cfg) {
    localStorage.setItem('web_serial_config', JSON.stringify(cfg));
}

// ── ESC/POS Ticket Printing ──────────────────────────────────────────────────

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

function escposEncoder() {
    const chunks = [];
    const encoder = new TextEncoder();

    const api = {
        init() { chunks.push(new Uint8Array([ESC, 0x40])); return api; },
        align(a) { // 0=left, 1=center, 2=right
            chunks.push(new Uint8Array([ESC, 0x61, a])); return api;
        },
        bold(on) { chunks.push(new Uint8Array([ESC, 0x45, on ? 1 : 0])); return api; },
        doubleHeight(on) { chunks.push(new Uint8Array([GS, 0x21, on ? 0x10 : 0x00])); return api; },
        bigText(on) { chunks.push(new Uint8Array([GS, 0x21, on ? 0x11 : 0x00])); return api; },
        text(str) { chunks.push(encoder.encode(str)); return api; },
        newline(n = 1) { for (let i = 0; i < n; i++) chunks.push(new Uint8Array([LF])); return api; },
        line(char = '-', len = 32) { chunks.push(encoder.encode(char.repeat(len))); chunks.push(new Uint8Array([LF])); return api; },
        row(left, right, width = 32) {
            const space = Math.max(1, width - left.length - right.length);
            chunks.push(encoder.encode(left + ' '.repeat(space) + right));
            chunks.push(new Uint8Array([LF]));
            return api;
        },
        cut() { chunks.push(new Uint8Array([GS, 0x56, 0x42, 0x00])); return api; },
        feed(n = 4) { chunks.push(new Uint8Array([ESC, 0x64, n])); return api; },
        build() {
            const total = chunks.reduce((s, c) => s + c.length, 0);
            const result = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) { result.set(c, offset); offset += c.length; }
            return result;
        }
    };
    return api;
}

function formatBsSimple(n) {
    return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Imprime un ticket de venta directamente via ESC/POS (sin diálogo del navegador).
 * Retorna true si se imprimió, false si no hay impresora conectada.
 */
export async function printReceiptEscPos(sale, bcvRate) {
    const port = await getConnectedPrinter();
    if (!port) return false;

    const settings = {
        name: localStorage.getItem('business_name') || 'Pool Los Diaz',
        rif: localStorage.getItem('business_rif') || '',
        phone: localStorage.getItem('business_phone') || '',
    };

    const rate = sale.rate || bcvRate || 1;
    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const W = 32; // chars por línea en 58mm

    const p = escposEncoder().init();

    // Header
    p.align(1).bold(true).doubleHeight(true).text(settings.name).newline();
    p.doubleHeight(false);
    if (settings.rif) p.bold(false).text('RIF: ' + settings.rif).newline();
    if (settings.phone) p.text('Tel: ' + settings.phone).newline();
    p.newline();

    // Nro venta + fecha
    p.bold(true).text('Venta #' + saleNum).newline();
    p.bold(false).text(new Date(sale.timestamp).toLocaleString('es-VE')).newline();

    // Mesa
    if (sale.tableName) {
        p.bold(true).text('Mesa: ' + sale.tableName).newline();
        p.bold(false);
    }

    // Cliente
    p.text('Cliente: ' + (capitalizeName(sale.customerName) || 'Consumidor Final')).newline();
    if (sale.meseroNombre) p.text('Atendido: ' + capitalizeName(sale.meseroNombre)).newline();

    p.align(0).line('=', W);

    // Items
    (sale.items || []).forEach(item => {
        const qty = item.isWeight ? item.qty.toFixed(3) + 'Kg' : item.qty + 'u';
        const subtotal = '$' + (item.priceUsd * item.qty).toFixed(2);
        p.bold(true).text(item.name).newline();
        p.bold(false).row('  ' + qty + ' x $' + item.priceUsd.toFixed(2), subtotal, W);
    });

    p.line('=', W);

    // Totales
    p.align(1).bigText(true).bold(true);
    p.text('$' + (sale.totalUsd || 0).toFixed(2)).newline();
    p.bigText(false).bold(false);
    p.text(formatBsSimple(sale.totalBs) + ' Bs').newline();
    if (sale.copEnabled && sale.tasaCop > 0) {
        const cop = sale.totalCop || (sale.totalUsd * sale.tasaCop);
        p.text(cop.toLocaleString('es-CO', { minimumFractionDigits: 2 }) + ' COP').newline();
    }
    p.newline();

    // Pagos
    p.align(0);
    if (sale.payments?.length > 0) {
        sale.payments.forEach(pm => {
            const label = pm.methodLabel || pm.methodId || 'Pago';
            const amt = pm.amountInputCurrency === 'USD' ? '$' + pm.amountInput :
                        pm.amountInputCurrency === 'COP' ? 'COP ' + pm.amountInput :
                        'Bs ' + pm.amountInput;
            p.row(label, amt, W);
        });
    }

    if (sale.changeUsd > 0) {
        p.line('-', W);
        p.bold(true).row('Vuelto:', '$' + sale.changeUsd.toFixed(2) + ' / ' + formatBsSimple(sale.changeBs) + ' Bs', W);
        p.bold(false);
    }

    if (sale.fiadoUsd > 0) {
        p.line('-', W);
        p.bold(true).row('Fiado:', '$' + sale.fiadoUsd.toFixed(2), W);
        p.bold(false);
    }

    p.line('-', W);
    p.align(0).text('Tasa BCV: ' + formatBsSimple(rate) + ' Bs/$').newline();

    // Pie
    p.newline();
    p.align(1).bold(true).text('Gracias por tu compra!').newline();
    p.bold(false).text('Comprobante de control interno').newline();

    p.feed(4).cut();

    const data = p.build();
    await sendEscPosCommand(Array.from(data));
    return true;
}
