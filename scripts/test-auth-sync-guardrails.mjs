import fs from 'node:fs';

const checks = [
  ['src/services/offlineQueueService.js', 'refreshSession'],
  ['src/services/offlineQueueService.js', 'AUTH_SESSION_REQUIRED'],
  ['src/hooks/useCloudSync.js', 'Cola pausada: sesión cloud no autorizada.'],
  ['src/hooks/useCloudSync.js', 'Sesión no autorizada; cola pausada hasta renovar sesión.'],
  ['src/utils/salesSyncService.js', 'Sesión no autorizada; se pausa la cola completa.'],
  ['src/utils/salesSyncService.js', 'getAuthorizedSession'],
  ['src/hooks/useCloudSync.js', 'salesSyncAuthPausedUntil'],
  ['src/hooks/useCloudSync.js', 'if (isCloudConfigured && cloudUserId) processSyncQueue();'],
  ['src/hooks/useCloudAuthLogic.js', 'Sesión cloud expirada. Inicia sesión nuevamente.'],
  ['src/hooks/useCloudAuthLogic.js',    'get_my_license_status'],
  ['src/hooks/useAppInit.js', "error.code === '42501'"],
  ['src/main.jsx', "contentType.includes('javascript')"],
  ['src/main.jsx', "navigator.serviceWorker.register(swUrl.pathname"],
];

for (const [file, marker] of checks) {
  if (!fs.readFileSync(file, 'utf8').includes(marker)) {
    throw new Error(`Falta guardarraíl: ${file} :: ${marker}`);
  }
}
console.log(`PASS: ${checks.length} guardarraíles de auth/sync verificados`);
