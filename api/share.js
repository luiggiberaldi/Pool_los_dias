// Vercel Serverless Function — Relay de inventario con código de 6 dígitos
// Storage: Upstash Redis (REST API, gratis)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 86400; // 24 horas
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB máximo

// Helper: ejecutar comando Redis via REST
async function redis(command, ...args) {
    const res = await fetch(`${UPSTASH_URL}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify([command, ...args]),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
}

// Generar código de 6 dígitos (formato: XXX-XXX)
function generateCode() {
    const num = Math.floor(100000 + Math.random() * 900000);
    return num.toString();
}

export default async function handler(req, res) {
    // CORS — permitir dominio de producción + localhost dev
    const origin = req.headers?.origin || '';
    const ALLOWED_ORIGINS = [
      'http://localhost:5173',
      'http://localhost:3000',
    ];
    const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.tasasaldia.com') ||
      origin.endsWith('.camelai.app') ||
      origin.endsWith('.camelai.dev');
    res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : '');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Verificar configuración
    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
        return res.status(500).json({ error: 'Upstash Redis no configurado. Agrega UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en las variables de entorno de Vercel.' });
    }

    try {
        // POST — Compartir inventario
        if (req.method === 'POST') {
            // Simple rate limiting: max 10 shares per IP per hour
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
            const rateLimitKey = `rl:${clientIp}`;
            const currentCount = parseInt(await redis('GET', rateLimitKey) || '0', 10);
            if (currentCount >= 10) {
                return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en una hora.' });
            }
            await redis('INCR', rateLimitKey);
            if (currentCount === 0) {
                await redis('EXPIRE', rateLimitKey, 3600);
            }

            const { products, categories, customers, sales } = req.body;

            // At least one data type must be present
            if ((!products || !Array.isArray(products) || products.length === 0) &&
                (!customers || !Array.isArray(customers) || customers.length === 0) &&
                (!sales || !Array.isArray(sales) || sales.length === 0)) {
                return res.status(400).json({ error: 'No hay datos para compartir.' });
            }

            // Validar tamaño del payload
            const payloadStr = JSON.stringify({ products, categories, customers, sales });
            const payloadSize = Buffer.byteLength(payloadStr, 'utf8');
            if (payloadSize > MAX_PAYLOAD_BYTES) {
                return res.status(413).json({ error: `Payload demasiado grande (${(payloadSize / 1024 / 1024).toFixed(1)}MB). Máximo: 5MB.` });
            }

            // Generar código único (reintentar si existe)
            let code;
            let attempts = 0;
            do {
                code = generateCode();
                const exists = await redis('EXISTS', `inv:${code}`);
                if (!exists) break;
                attempts++;
            } while (attempts < 5);

            // After the loop, verify we got a unique code
            const finalExists = await redis('EXISTS', `inv:${code}`);
            if (finalExists) {
                return res.status(503).json({ error: 'No se pudo generar un código único. Intenta de nuevo.' });
            }

            // Guardar en Redis con TTL de 24h
            const payload = JSON.stringify({
                products: products || [],
                categories: categories || null,
                customers: customers || [],
                sales: sales || [],
                createdAt: new Date().toISOString(),
                count: (products?.length || 0) + (customers?.length || 0) + (sales?.length || 0),
            });

            await redis('SET', `inv:${code}`, payload, 'EX', TTL_SECONDS);

            return res.status(200).json({
                code: `${code.slice(0, 3)}-${code.slice(3)}`,
                expiresIn: '24 horas',
                productCount: products?.length || 0,
                customerCount: customers?.length || 0,
                salesCount: sales?.length || 0,
            });
        }

        // GET — Importar inventario por código
        if (req.method === 'GET') {
            const { code } = req.query;

            if (!code) {
                return res.status(400).json({ error: 'Código requerido.' });
            }

            // Limpiar formato (quitar guiones, espacios)
            const cleanCode = code.replace(/[-\s]/g, '');

            if (cleanCode.length !== 6 || !/^\d+$/.test(cleanCode)) {
                return res.status(400).json({ error: 'Código inválido. Usa el formato XXX-XXX.' });
            }

            const data = await redis('GET', `inv:${cleanCode}`);

            if (!data) {
                return res.status(404).json({ error: 'Código no encontrado o expirado.' });
            }

            const parsed = JSON.parse(data);
            return res.status(200).json(parsed);
        }

        return res.status(405).json({ error: 'Método no permitido.' });
    } catch (err) {
        console.error('Share API error:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
