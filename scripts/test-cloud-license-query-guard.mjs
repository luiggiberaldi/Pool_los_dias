import fs from 'node:fs';

const auth = fs.readFileSync('src/hooks/useCloudAuthLogic.js', 'utf8');
const users = fs.readFileSync('src/components/Settings/tabs/SettingsTabUsuarios.jsx', 'utf8');
const sync = fs.readFileSync('src/hooks/useCloudSync.js', 'utf8');

if (/from\(['"]cloud_licenses['"]\)/.test(auth)) {
  throw new Error('useCloudAuthLogic todavía consulta cloud_licenses directamente');
}
if (/from\(['"]cloud_licenses['"]\)/.test(users)) {
  throw new Error('SettingsTabUsuarios todavía consulta cloud_licenses directamente');
}
if (!users.includes("supabaseCloud.rpc('get_my_license_status')")) {
  throw new Error('Falta la ruta RPC para consultar el estado de licencia');
}
if (!users.includes("if (!session?.user?.id)")) {
  throw new Error('Falta guardarraíl de sesión en gestión de dispositivos');
}
if (!sync.includes('Cola pausada: sesión cloud no autorizada.')) {
  throw new Error('Falta pausa de cola sin sesión');
}
console.log('PASS: 4 invariantes deterministas del fix verificadas');
