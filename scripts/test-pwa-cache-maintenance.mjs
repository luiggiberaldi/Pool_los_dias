import fs from 'node:fs';

const source = fs.readFileSync('src/main.jsx', 'utf8');
const required = [
  'maintainPwaCache',
  'navigator.serviceWorker.getRegistrations()',
  'caches.keys()',
  'caches.delete(name)',
  'currentRegistration.update()',
  "postMessage({ type: 'CLEAR_OLD_CACHES'"
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Falta guardarraíl PWA: ${marker}`);
}
console.log(`PASS: ${required.length} guardarraíles deterministas de PWA verificados`);
