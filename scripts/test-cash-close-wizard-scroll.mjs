import fs from 'node:fs';
const source = fs.readFileSync('src/components/Dashboard/CierreCajaWizard.jsx', 'utf8');
let passed = 0;
let failed = 0;
const ok = (condition, label) => {
  if (condition) { passed++; console.log(`✅ ${label}`); }
  else { failed++; console.error(`❌ ${label}`); }
};
ok(source.includes('max-h-[calc(100dvh-1rem)]'), 'Modal limitado por viewport dinámico en laptop');
ok(source.includes('sm:max-h-[calc(100dvh-2rem)]'), 'Modal con margen seguro en pantallas grandes');
ok(source.includes('min-h-0 flex-1 overflow-y-auto'), 'Contenido con flex min-h-0 y scroll interno');
ok(source.includes('overscroll-contain'), 'Scroll contenido dentro del wizard');
ok(source.includes('onClick={e => e.stopPropagation()}'), 'El scroll no dispara cierre accidental del modal');
if (failed) process.exit(1);
console.log(`PASS: ${passed}/${passed} guardarraíles de scroll del wizard`);
