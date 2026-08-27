import fs from 'node:fs';

const auth = fs.readFileSync('src/hooks/useCloudAuthLogic.js', 'utf8');
const init = fs.readFileSync('src/hooks/useAppInit.js', 'utf8');

if (!auth.includes("if (choice === 'cloud')")) throw new Error('Falta rama de restauración cloud');
if (!auth.includes("setDataConflictPending(null)")) throw new Error('El conflicto no se limpia tras completar');
if (!auth.includes("setStatusMessage('');")) throw new Error('El estado visual no se limpia tras restaurar');
if (!auth.includes("Datos de la nube restaurados correctamente.")) throw new Error('Falta confirmación de restauración cloud');
if (!init.includes("if (result === 'limit_reached')") || !init.includes('setCloudSession(session)')) {
  throw new Error('limit_reached todavía destruye la sesión antes de resolver el conflicto');
}
const cloudBranch = auth.slice(auth.indexOf("if (choice === 'cloud')"), auth.indexOf("} else {", auth.indexOf("if (choice === 'cloud')")));
if (/window\.location\.reload/.test(cloudBranch)) throw new Error('Restaurar cloud todavía fuerza reload dentro de la rama');
console.log('PASS: 4 invariantes deterministas de restauración cloud verificadas');
