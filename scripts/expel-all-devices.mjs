import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const email = process.env.EXPEL_EMAIL;
const password = process.env.EXPEL_PASSWORD;
if (!url || !key || !email || !password) {
  console.error('Faltan VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, EXPEL_EMAIL o EXPEL_PASSWORD.');
  process.exit(2);
}
const supabase = createClient(url, key);
const { data: signed, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError || !signed.session?.user?.id) {
  console.error(`Login fallido: ${signInError?.message || 'sesión no emitida'}`);
  process.exit(1);
}
const userId = signed.session.user.id;
const { data: devices, error: readError } = await supabase
  .from('account_devices').select('device_id, device_alias, last_seen').eq('user_id', userId);
if (readError) {
  console.error(`Lectura de dispositivos fallida: ${readError.message}`);
  process.exit(1);
}
console.log(`Dispositivos encontrados: ${devices?.length || 0}`);
const { error: deleteError } = await supabase.from('account_devices').delete().eq('user_id', userId);
if (deleteError) {
  console.error(`Expulsión fallida: ${deleteError.message}`);
  process.exit(1);
}
console.log(`Expulsados: ${devices?.length || 0}. Ventas y sync_documents no fueron modificados.`);
await supabase.auth.signOut();
