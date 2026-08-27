import fs from 'node:fs';

/**
 * Rollback del port PLAN-CAJA-ESPACIO (2026-08-27).
 * Restaura los 4 archivos originales desde backups/caja-espacio-20260827/
 *
 * Uso: bun run restore:caja-espacio
 */
const BASE = 'backups/caja-espacio-20260827';
const FILES = [
    'src/views/SalesView.jsx',
    'src/components/Sales/SalesHeader.jsx',
    'src/components/Sales/CategoryBar.jsx',
    'src/components/Sales/CartPanel.jsx',
];

let restored = 0;
for (const rel of FILES) {
    const backupPath = `${BASE}/${rel}`;
    if (!fs.existsSync(backupPath)) {
        console.error(`  ❌ Backup no encontrado: ${backupPath}`);
        continue;
    }
    fs.copyFileSync(backupPath, rel);
    console.log(`  ✅ Restaurado: ${rel}`);
    restored++;
}

console.log(`\nRollback completo: ${restored}/${FILES.length} archivos restaurados.`);
if (restored === FILES.length) {
    console.log('Ejecuta `bun run build` para verificar.');
} else {
    console.error('Algunos archivos no se pudieron restaurar — revisa los mensajes.');
    process.exit(1);
}
