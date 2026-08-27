import fs from 'node:fs';
const sync = fs.readFileSync('src/utils/salesSyncService.js', 'utf8');
const checkout = fs.readFileSync('src/utils/checkoutProcessor.js', 'utf8');
let passed = 0;
let failed = 0;
const ok = (condition, label) => {
    if (condition) { passed++; console.log(`✅ ${label}`); }
    else { failed++; console.error(`❌ ${label}`); }
};
ok(sync.includes("getPendingSalesKnownKey = () => scopedKey('_pending_sale_uploads_initialized')"), 'Existe marca de inicialización de cola');
ok(sync.includes("if (!queueInitialized)"), 'Detecta cola heredada sin inicializar');
ok(sync.includes("localStorage.setItem(getPendingSalesQueueKey(), '[]')"), 'Limpia la cola heredada masiva');
ok(sync.includes("localStorage.setItem(getPendingSalesKnownKey(), '1')"), 'La limpieza ocurre una sola vez por cuenta');
ok(sync.includes('pendingIds = [...new Set(pendingIds)]'), 'Deduplica IDs pendientes');
ok(!sync.includes('if (s.id && !pendingIds.includes(s.id)) pendingIds.push(s.id)'), 'No convierte el historial entero en cola');
ok(checkout.includes("localStorage.setItem(scopedKey('_pending_sale_uploads_initialized'), '1')"), 'Checkout marca las colas nuevas como válidas');
ok(sync.includes('uploadedIds.length} venta(s) sincronizada(s)'), 'Toast solo habla de ventas subidas');
ok(sync.includes('lastSalesSyncToastAt'), 'Toast tiene deduplicación temporal');
if (failed) {
    console.error(`FAIL: ${failed} de ${passed + failed}`);
    process.exit(1);
}
console.log(`PASS: ${passed}/${passed} guardarraíles de cola y notificación`);
