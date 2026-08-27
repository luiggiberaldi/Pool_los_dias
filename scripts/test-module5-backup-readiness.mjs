import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function loadEnv() {
    const values = {};
    if (!fs.existsSync('.env')) return values;
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return values;
}
function available(command) {
    try {
        execFileSync(process.platform === 'win32' ? 'where' : 'command', process.platform === 'win32' ? [command] : ['-v', command], { stdio: 'ignore' });
        return true;
    } catch { return false; }
}
function assertCheck(condition, message) {
    if (!condition) throw new Error(`MODULE5_ABORT: ${message}`);
}

const env = loadEnv();
assertCheck(env.SUPABASE_PROJECT_REF, 'falta SUPABASE_PROJECT_REF');
assertCheck(env.SUPABASE_ACCESS_TOKEN, 'falta SUPABASE_ACCESS_TOKEN');
const tools = Object.fromEntries(['pg_dump', 'pg_restore', 'psql'].map(tool => [tool, available(tool)]));
const dbUrlConfigured = Boolean(env.SUPABASE_DB_URL);
const poolerHost = env.SUPABASE_DB_URL?.match(/@([^:/]+)(?::\d+)?\//)?.[1] || null;
const likelyPooler = Boolean(poolerHost?.includes('pooler.supabase.com'));

console.log(JSON.stringify({
    status: Object.values(tools).every(Boolean) && dbUrlConfigured && !likelyPooler ? 'READY_FOR_RESTORE_TEST' : 'BLOCKED_CONFIGURATION',
    tools,
    db_url_configured: dbUrlConfigured,
    db_host_class: likelyPooler ? 'POOLER_REQUIRES_VALIDATED_TENANT_USER' : poolerHost ? 'DIRECT_OR_CUSTOM' : 'MISSING',
    destructive_operations: 0,
    next_requirement: Object.values(tools).every(Boolean) && dbUrlConfigured && !likelyPooler
        ? 'crear dump y restaurarlo en una base aislada'
        : 'instalar PostgreSQL client tools y configurar la cadena Direct exacta desde Supabase Connect',
}, null, 2));
