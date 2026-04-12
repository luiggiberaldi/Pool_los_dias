/**
 * webSerialPrinter.js
 * Servicio de integración nativa con impresoras térmicas USB/Serial mediante Web Serial API.
 * Incluye auto-detección de modelo por VID/PID.
 *
 * ESC/POS Comandos Básicos
 * Init: [27, 64]
 * Open Drawer: [27, 112, 0, 50, 250]
 */

import { capitalizeName } from '../utils/calculatorUtils';
import { lookupPrinter } from './printerDatabase';

let activePort = null;

// ── Config ────────────────────────────────────────────────────────────────────

export function getWebSerialConfig() {
    try {
        const saved = localStorage.getItem('web_serial_config');
        const defaults = { autoOpenDrawer: false, baudRate: 9600, printerType: 'system', printerBrand: 'Impresora del Sistema', printerModel: 'Driver del Sistema', paperWidth: 58 };
        return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
        return { autoOpenDrawer: false, baudRate: 9600, printerType: 'system', printerBrand: 'Impresora del Sistema', printerModel: 'Driver del Sistema', paperWidth: 58 };
    }
}

export function saveWebSerialConfig(cfg) {
    localStorage.setItem('web_serial_config', JSON.stringify(cfg));
}

export function clearPrinterConfig() {
    const cfg = getWebSerialConfig();
    saveWebSerialConfig({ ...cfg, printerType: null, printerBrand: null, printerModel: null });
    activePort = null;
}

// ── Port management ───────────────────────────────────────────────────────────

export async function requestPrinterPort() {
    if (!('serial' in navigator)) {
        throw new Error('Web Serial API NO soportada. Usa Chrome o Edge.');
    }
    try {
        const port = await navigator.serial.requestPort();
        activePort = port;
        return port;
    } catch (err) {
        if (err.name === 'NotFoundError') throw new Error('Cancelaste la selección del puerto.');
        throw err;
    }
}

export async function getConnectedPrinter() {
    if (!('serial' in navigator)) return null;
    try {
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
            activePort = ports[0];
            return activePort;
        }
        return null;
    } catch (err) {
        console.error('Error recuperando puertos', err);
        return null;
    }
}

// ── Auto-detección ────────────────────────────────────────────────────────────

/**
 * Detecta la impresora conectada leyendo el VID/PID del puerto USB.
 * Si ya hay puertos autorizados, los usa directamente.
 * Si no, abre el picker del navegador para que el usuario elija.
 *
 * Retorna el objeto de config detectado y lo guarda automáticamente.
 */
export async function detectAndAutoConfig() {
    if (!('serial' in navigator)) {
        throw new Error('Web Serial API no soportada. Usa Chrome o Edge.');
    }

    // 1. Ver si ya hay puertos autorizados
    let port = null;
    const existingPorts = await navigator.serial.getPorts();
    if (existingPorts.length > 0) {
        port = existingPorts[0];
    } else {
        // 2. Pedir al usuario que elija un puerto
        port = await navigator.serial.requestPort();
    }

    if (!port) throw new Error('No se seleccionó ningún puerto.');
    activePort = port;

    // 3. Leer VID/PID
    const info = port.getInfo();
    const { usbVendorId, usbProductId } = info;

    // 4. Buscar en la base de datos
    const match = lookupPrinter(usbVendorId, usbProductId);

    // 5. Construir config
    const currentCfg = getWebSerialConfig();
    let detected;

    if (match) {
        detected = {
            ...currentCfg,
            baudRate:     match.baudRate  || currentCfg.baudRate,
            paperWidth:   match.paperWidth || currentCfg.paperWidth,
            printerType:  match.type,
            printerBrand: match.brand,
            printerModel: match.model,
            printerNote:  match.note || null,
            usbVendorId:  usbVendorId ? `0x${usbVendorId.toString(16).toUpperCase().padStart(4,'0')}` : null,
            usbProductId: usbProductId ? `0x${usbProductId.toString(16).toUpperCase().padStart(4,'0')}` : null,
        };
    } else if (!usbVendorId) {
        // Sin datos USB → puerto COM físico o Bluetooth virtual.
        // Impresoras como FC-58S conectadas por USB NO aparecen aquí (usan clase USB Printer, no serial).
        // Si el usuario llegó acá con una FC-58S, debe usar modo "Impresora del Sistema".
        detected = {
            ...currentCfg,
            printerType:  'system',
            printerBrand: 'Impresora del Sistema',
            printerModel: 'Sin datos USB — usar driver de Windows',
            noVidPid: true,
            usbVendorId:  null,
            usbProductId: null,
        };
    } else {
        // Tiene VID/PID pero no está en la base de datos → asumir térmica serial
        detected = {
            ...currentCfg,
            printerType:  'thermal_serial',
            printerBrand: 'Desconocida',
            printerModel: `VID:0x${usbVendorId.toString(16).toUpperCase()} PID:${usbProductId ? '0x' + usbProductId.toString(16).toUpperCase() : 'N/A'}`,
            usbVendorId:  `0x${usbVendorId.toString(16).toUpperCase().padStart(4,'0')}`,
            usbProductId: usbProductId ? `0x${usbProductId.toString(16).toUpperCase().padStart(4,'0')}` : null,
        };
    }

    saveWebSerialConfig(detected);
    return detected;
}

// ── ESC/POS commands ──────────────────────────────────────────────────────────

export async function sendEscPosCommand(commandArray) {
    if (!activePort) {
        const port = await getConnectedPrinter();
        if (!port) throw new Error('No hay impresora conectada. Ve a Configuración → Impresora y pulsa "Detectar".');
    }

    const cfg = getWebSerialConfig();

    // Helper: abrir, escribir y cerrar para asegurar flush completo
    const writeToPort = async (port) => {
        const needsOpen = !port.writable;
        if (needsOpen) {
            await port.open({ baudRate: cfg.baudRate || 9600, bufferSize: 4096 });
        }

        const writer = port.writable.getWriter();
        const data = new Uint8Array(commandArray);
        await writer.write(data);
        writer.releaseLock();

        // Cerrar y reabrir fuerza flush del buffer USB al dispositivo
        try {
            await port.close();
        } catch (_) {}
        // Reabrir para mantener el puerto listo para el siguiente comando
        try {
            await port.open({ baudRate: cfg.baudRate || 9600, bufferSize: 4096 });
        } catch (_) {}

        return true;
    };

    try {
        return await writeToPort(activePort);
    } catch (err) {
        // Si el puerto estaba en estado roto, intentar reconectar
        if (err.message?.includes('already') || err.message?.includes('closed') || err.message?.includes('lost') || err.message?.includes('failed')) {
            try { await activePort.close(); } catch (_) {}
            try {
                return await writeToPort(activePort);
            } catch (retryErr) {
                console.error('Web Serial Retry Error:', retryErr);
            }
        }
        console.error('Web Serial Error:', err);
        throw new Error(`Error de impresión: ${err.message}`);
    }
}

export async function openCashDrawerWebSerial() {
    // ESC p m t1 t2 — 27=ESC 112=p m=drawer t1=on t2=off
    // Enviar pulso a AMBOS pines del cajón por compatibilidad:
    //   Pin 0 (drawer 1): usado por la mayoría de impresoras
    //   Pin 1 (drawer 2): usado por algunas cajas registradoras / FC-588
    return await sendEscPosCommand([
        27, 112, 0, 50, 250,   // drawer pin 0
        27, 112, 1, 50, 250,   // drawer pin 1
    ]);
}

/**
 * Imprime la pre-cuenta de mesa via ESC/POS directo (SIN abrir cajón).
 * Se usa en lugar del PDF+iframe para evitar que la impresora térmica
 * abra el cajón al recibir un trabajo de impresión del sistema.
 */
export async function printPreCuentaEscPos({ table, session, elapsed, timeCost, currentItems, grandTotal, tasaUSD, config }) {
    const port = await getConnectedPrinter();
    if (!port) return false;

    const cfg = getWebSerialConfig();
    const W = cfg.paperWidth >= 80 ? 42 : 32;

    const p = escposEncoder().init();

    p.align(1).bold(true).doubleHeight(true).text('PRE-CUENTA MESA').newline();
    p.doubleHeight(false).text(table.name.toUpperCase()).newline();
    p.newline();

    const d = new Date();
    p.bold(false).align(0).text(`Fecha: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`).newline();
    if (session?.client_name) {
        p.bold(true).text(`Cliente: ${session.client_name}`).bold(false).newline();
    }
    p.line('-', W);

    if (timeCost > 0) {
        const isPina = session.game_mode === 'PINA';
        p.bold(true).text(isPina ? 'Partidas (La Pina)' : 'Tiempo de Mesa').newline().bold(false);
        if (isPina) {
            const partidas = 1 + (Number(session.extended_times) || 0);
            p.row(`${partidas} pina${partidas !== 1 ? 's' : ''} x $${(timeCost / partidas).toFixed(2)}`, `$${timeCost.toFixed(2)}`, W);
        } else {
            const horas = elapsed / 60;
            const timeStr = horas < 1 ? Math.ceil(horas * 60) + ' min' : horas.toFixed(1) + 'h';
            p.row(timeStr, `$${timeCost.toFixed(2)}`, W);
        }
        p.newline();
    }

    if (currentItems && currentItems.length > 0) {
        p.bold(true).text('Consumo Bar').newline().bold(false);
        currentItems.forEach(i => {
            const t = i.qty * i.unit_price_usd;
            const name = (i.product_name || '').substring(0, Math.floor(W * 0.55));
            p.row(`${i.qty}x ${name}`, `$${t.toFixed(2)}`, W);
        });
        p.newline();
    }

    p.line('=', W);
    p.align(1).bold(true).text('TOTAL ESTIMADO:').newline();
    p.text(`$${grandTotal.toFixed(2)}`).newline();
    p.bold(false);
    if (tasaUSD && tasaUSD > 1) {
        // Calcular Bs con tasa implícita si hay config de precios Bs
        let totalBs;
        if (timeCost > 0) {
            const gameMode = session?.game_mode;
            // Leer de config con fallback a localStorage
            const priceBs = gameMode === 'PINA'
                ? (config?.pricePinaBs || parseFloat(localStorage.getItem('pool_price_pina_bs')) || 0)
                : (config?.pricePerHourBs || parseFloat(localStorage.getItem('pool_price_per_hour_bs')) || 0);
            const priceUsd = gameMode === 'PINA' ? (config?.pricePina || 0) : (config?.pricePerHour || 0);
            const timeBs = (priceBs > 0 && priceUsd > 0)
                ? Math.round(timeCost * (priceBs / priceUsd) * 100) / 100
                : timeCost * tasaUSD;
            const consumoBs = (grandTotal - timeCost) * tasaUSD;
            totalBs = Math.round((timeBs + consumoBs) * 100) / 100;
        } else {
            totalBs = Math.round(grandTotal * tasaUSD * 100) / 100;
        }
        p.text(`Ref: Bs. ${totalBs.toFixed(2)}`).newline();
    }
    p.newline();
    p.align(1).text('*** NO ES RECIBO DE PAGO ***').newline();
    p.feed(4).cut();

    await sendEscPosCommand(Array.from(p.build()));
    return true;
}

export async function printTestWebSerial() {
    const lines = [
        '================================',
        '     IMPRESORA CONECTADA        ',
        '================================',
        ' COL-POS / Termica 58mm        ',
        ' ESC/POS via Web Serial API    ',
        ' Baud: 9600  Papel: 58mm       ',
        '--------------------------------',
        ' 1234567890123456789012345678901',
        ' ^-- 32 caracteres por linea  --',
        '================================',
        '',
        '',
        '',
    ];
    const encoder = new TextEncoder();
    const payload = [27, 64]; // ESC @ init
    for (const line of lines) {
        payload.push(...Array.from(encoder.encode(line + '\n')));
    }
    payload.push(29, 86, 66, 0); // cut
    return await sendEscPosCommand(payload);
}

// ── ESC/POS Ticket Printing ───────────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

function escposEncoder() {
    const chunks = [];
    const encoder = new TextEncoder();
    const api = {
        init()           { chunks.push(new Uint8Array([ESC, 0x40])); return api; },
        align(a)         { chunks.push(new Uint8Array([ESC, 0x61, a])); return api; },
        bold(on)         { chunks.push(new Uint8Array([ESC, 0x45, on ? 1 : 0])); return api; },
        smallFont(on)    { chunks.push(new Uint8Array([ESC, 0x4D, on ? 1 : 0])); return api; }, // ESC M — Font B (9x17): 42 chars/línea en 58mm
        doubleHeight(on) { chunks.push(new Uint8Array([GS,  0x21, on ? 0x10 : 0x00])); return api; },
        bigText(on)      { chunks.push(new Uint8Array([GS,  0x21, on ? 0x11 : 0x00])); return api; },
        text(str)        { chunks.push(encoder.encode(str)); return api; },
        newline(n = 1)   { for (let i = 0; i < n; i++) chunks.push(new Uint8Array([LF])); return api; },
        line(char = '-', len = 32) {
            chunks.push(encoder.encode(char.repeat(len)));
            chunks.push(new Uint8Array([LF]));
            return api;
        },
        row(left, right, width = 32) {
            // Si el contenido total desborda, recortar 'left' para preservar 'right'
            const maxLeft = width - right.length - 1;
            const safeLeft = left.length > maxLeft ? left.substring(0, maxLeft - 1) + '…' : left;
            const space = Math.max(1, width - safeLeft.length - right.length);
            chunks.push(encoder.encode(safeLeft + ' '.repeat(space) + right));
            chunks.push(new Uint8Array([LF]));
            return api;
        },
        cut()  { chunks.push(new Uint8Array([GS, 0x56, 0x42, 0x00])); return api; },
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
        name:  localStorage.getItem('business_name')  || 'Pool Los Diaz',
        rif:   localStorage.getItem('business_rif')   || '',
        phone: localStorage.getItem('business_phone') || '',
    };

    const rate    = sale.rate || bcvRate || 1;
    const saleNum = String(sale.saleNumber || 0).padStart(7, '0');
    const cfg     = getWebSerialConfig();
    const W       = cfg.paperWidth >= 80 ? 42 : 32; // chars por línea (font normal)
    const WS      = cfg.paperWidth >= 80 ? 56 : 42; // chars por línea (font pequeña)

    const p = escposEncoder().init();

    // Header
    p.align(1).bold(true).doubleHeight(true).text(settings.name).newline();
    p.doubleHeight(false);
    if (settings.rif)   p.bold(false).text('RIF: ' + settings.rif).newline();
    if (settings.phone) p.text('Tel: ' + settings.phone).newline();
    p.newline();

    // Nro venta + fecha
    p.bold(true).text('Venta #' + saleNum).newline();
    p.bold(false).text(new Date(sale.timestamp).toLocaleString('es-VE')).newline();

    if (sale.tableName) {
        p.bold(true).text('Mesa: ' + sale.tableName).newline();
        p.bold(false);
    }
    p.text('Cliente: ' + (capitalizeName(sale.customerName) || 'Consumidor Final')).newline();
    if (sale.meseroNombre) p.text('Atendido: ' + capitalizeName(sale.meseroNombre)).newline();

    p.align(0).line('=', W);

    // Items — font pequeña (42 chars/línea en 58mm) para aprovechar mejor el espacio
    (sale.items || []).forEach(item => {
        const qty      = item.isWeight ? item.qty.toFixed(3) + 'Kg' : item.qty + 'u';
        const unitStr  = '$' + item.priceUsd.toFixed(2);
        const subtotal = '$' + (item.priceUsd * item.qty).toFixed(2);
        const detail   = '  ' + qty + ' x ' + unitStr;
        // Nombre: font normal, negrita, truncado a W chars
        const name = item.name.length > W ? item.name.substring(0, W - 1) + '…' : item.name;
        p.bold(true).text(name).newline();
        // Detalle: font pequeña para aprovechar los 42 chars
        p.bold(false).smallFont(true).row(detail, subtotal, WS);
        p.smallFont(false);
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
            const amt   = pm.amountInputCurrency === 'USD' ? '$' + pm.amountInput :
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
    p.newline();
    p.align(1).bold(true).text('Gracias por tu compra!').newline();
    p.bold(false).text('Comprobante de control interno').newline();

    p.feed(4).cut();

    await sendEscPosCommand(Array.from(p.build()));
    return true;
}
