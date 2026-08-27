import fs from 'node:fs';
const sql = fs.readFileSync('module1_device_admin_rpc.sql', 'utf8');
const auth = fs.readFileSync('src/hooks/useCloudAuthLogic.js', 'utf8');
const users = fs.readFileSync('src/components/Settings/tabs/SettingsTabUsuarios.jsx', 'utf8');
for (const marker of [
  'CREATE OR REPLACE FUNCTION public.get_my_license_status()',
  'CREATE OR REPLACE FUNCTION public.get_my_devices()',
  'CREATE OR REPLACE FUNCTION public.remove_my_device(p_device_id TEXT)',
  "REVOKE ALL ON FUNCTION public.remove_my_device(TEXT) FROM PUBLIC, anon;",
  "supabaseCloud.rpc('get_my_devices'",
  "supabaseCloud.rpc('remove_my_device'",
  "supabaseCloud.rpc('get_my_license_status')",
  "Falta aplicar module1_device_admin_rpc.sql en Supabase."
]) {
  if (![sql, auth, users].some(text => text.includes(marker))) throw new Error(`Falta contrato: ${marker}`);
}
if (/from\(['"]cloud_licenses['"]\)/.test(auth) || /from\(['"]cloud_licenses['"]\)/.test(users)) throw new Error('Quedó acceso directo a cloud_licenses');
console.log('PASS: 7 invariantes deterministas de administración de dispositivos verificadas');
