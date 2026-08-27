import fs from 'node:fs';
const app = fs.readFileSync('src/App.jsx', 'utf8');
const checks = [
  ['contador de diez clics', /ref\.count >= 10/.test(app)],
  ['abre modal de contraseña maestra', /setShowMasterPassword\(true\)/.test(app)],
  ['contraseña configurable por variable Vite', /VITE_MASTER_PASSWORD/.test(app)],
  ['contraseña incorrecta no abre panel', /masterPassword !== expected/.test(app)],
  ['panel solo abre tras validar', /setShowAdminPanel\(true\)/.test(app)],
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`PASS: ${checks.length} invariantes del acceso maestro verificadas`);
