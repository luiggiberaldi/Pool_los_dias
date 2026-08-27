import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

// 1. Leer variables de entorno desde .env
const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ Error: No se encontró el archivo .env en la raíz del proyecto.');
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
        env[key] = val;
    }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY faltantes en el .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Obtener credenciales desde argumentos de consola o preguntar
async function getCredentials() {
    const args = process.argv.slice(2);
    if (args.length >= 2) {
        return { email: args[0], password: args[1] };
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = (query) => new Promise(resolve => rl.question(query, resolve));
    
    console.log('\n🔐 Autenticación requerida para acceder al catálogo seguro en la nube:');
    const email = await ask('📧 Email de tu cuenta de POS: ');
    
    // Simple mask for password in stdout prompt
    rl.stdoutMuted = true;
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (rl.stdoutMuted)
            rl.output.write("*");
        else
            rl.output.write(stringToWrite);
    };
    
    const password = await ask('🔑 Contraseña: ');
    console.log('\n');
    rl.close();
    
    return { email: email.trim(), password: password.trim() };
}

async function run() {
    try {
        const { email, password } = await getCredentials();
        
        console.log('🔄 Iniciando sesión en Supabase...');
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authErr) {
            console.error('❌ Error al autenticar:', authErr.message);
            process.exit(1);
        }

        const userId = authData.user?.id;
        console.log(`✅ Sesión iniciada con éxito. User ID: ${userId}`);
        console.log('🔄 Descargando catálogo actual desde sync_documents...');

        const { data: syncDocs, error: syncErr } = await supabase
            .from('sync_documents')
            .select('data')
            .eq('user_id', userId)
            .eq('doc_id', 'bodega_products_v1')
            .eq('collection', 'store')
            .maybeSingle();

        if (syncErr) {
            console.error('❌ Error al consultar la nube:', syncErr.message);
            process.exit(1);
        }

        if (!syncDocs || !syncDocs.data?.payload) {
            console.error('⚠️ Advertencia: No se encontraron productos cargados en esta cuenta de la nube.');
            process.exit(1);
        }

        const products = syncDocs.data.payload;
        console.log(`📦 Catálogo recuperado: ${products.length} productos activos.`);

        // 3. Escribir archivo semilla src/config/initialProducts.js
        const seedPath = path.resolve(process.cwd(), 'src/config/initialProducts.js');
        const seedContent = `// Catálogo Semilla de Emergencia - Pool Los Diaz
// Este archivo actúa como bóveda de seguridad local inmutable.
// Generado automáticamente el: ${new Date().toLocaleString('es-VE')}

export const initialProducts = ${JSON.stringify(products, null, 4)};
`;

        fs.writeFileSync(seedPath, seedContent, 'utf-8');
        console.log(`🎉 ¡Éxito! Archivo de semilla inmutable generado con éxito en:\n👉 ${seedPath}\n`);

    } catch (e) {
        console.error('❌ Ocurrió un error inesperado durante la ejecución:', e);
    }
}

run();
