import fs from 'node:fs';

const checks = [
  ['src/hooks/store/tableSessionActions.js', "throw new Error('No hay cuenta cloud autenticada para abrir la mesa')"],
  ['src/hooks/store/tableSyncActions.js', "throw new Error('No hay cuenta cloud autenticada para crear la mesa')"],
  ['src/hooks/store/cashStore.js', "throw new Error('No hay cuenta cloud autenticada para abrir caja')"],
  ['src/utils/checkoutProcessor.js', 'idempotencyKey'],
  ['src/services/offlineQueueService.js', 'idempotency_key'],
  ['module4_checkout_idempotency_migration.sql', 'Idempotency key reused with different payload'],
  ['module4_checkout_idempotency_migration.sql', 'Checkout payments do not balance with total'],
  ['module1_identity_security_migration.sql', 'WITH CHECK (user_id = auth.uid())'],
];

for (const [file, needle] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(needle)) throw new Error(`Falta guardarraíl: ${file} :: ${needle}`);
}

console.log(`PASS: ${checks.length} guardarraíles de integridad futura verificados`);
