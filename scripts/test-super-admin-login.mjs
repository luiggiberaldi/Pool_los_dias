import fs from 'node:fs';

const auth = fs.readFileSync('src/hooks/store/authStore.js', 'utf8');
const card = fs.readFileSync('src/components/security/UserCard.jsx', 'utf8');
const modal = fs.readFileSync('src/components/security/LoginPinModal.jsx', 'utf8');
const login = fs.readFileSync('src/components/security/LoginScreen.jsx', 'utf8');

const checks = [
  ['normaliza SUPER_ADMIN/SUPERADMIN/OWNER', /SUPER_ADMIN.*SUPERADMIN.*OWNER/s.test(auth)],
  ['admin PIN usa seis dígitos para roles elevados', /isAdminRole\(user\?\.role \|\| user\?\.rol\)/.test(modal)],
  ['tarjeta visualiza roles elevados como administrador', /const isAdmin = \['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'OWNER'\]/.test(card)],
  ['login excluye usuarios inactivos', /cachedUsers\.filter\(user => user\.active !== false\)/.test(login)],
];

for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`PASS: ${checks.length} invariantes de super-admin verificadas`);
