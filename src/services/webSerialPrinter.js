/**
 * webSerialPrinter.js
 * Servicio de integración nativa con impresoras térmicas USB/Serial mediante Web Serial API.
 * 
 * ESC/POS Comandos Básicos
 * Init: [27, 64]
 * Open Drawer: [27, 112, 0, 50, 250]
 */

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
