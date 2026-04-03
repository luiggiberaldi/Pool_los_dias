// Utilidades criptográficas para seguridad en frontend (offline-first)

/**
 * Hashea un texto (PIN) usando SHA-256 de la Web Crypto API.
 * @param {string} pin - El PIN en texto plano.
 * @returns {Promise<string>} - El hash en formato hexadecimal.
 */
export async function hashPin(pin) {
    if (!pin) return null;
    
    // Convertir el string del PIN a un array de bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(pin.toString());
    
    // Generar el hash (devuelve un ArrayBuffer)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Convertir el buffer a un string hexadecimal
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}
