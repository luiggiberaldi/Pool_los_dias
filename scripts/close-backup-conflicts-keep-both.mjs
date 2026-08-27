/**
 * Cierra los conflictos del backup con la política KEEP_BOTH_DUPLICATE.
 *
 * Esta operación solo actualiza decisiones privadas del ledger:
 *   - ambos documentos cloud permanecen intactos;
 *   - la propuesta exacta queda como evidencia;
 *   - no se elimina, archiva ni modifica sync_documents.
 *
 * Ejecutar:
 *   bun scripts/close-backup-conflicts-keep-both.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BACKUP_PATH = 'backup_pool_los_diaz_2026-08-19.json';
const RESOLUTION_MIGRATION_PATH = 'backup_conflict_review_resolution_migration.sql';
const SCHEMA = 'module2_internal';

function loadEnv() {
    const values = {};
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        let value = match[2].trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        values[match[1]] = value;
    }
    return values;
}

function assertCheck(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

function sqlLiteral(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
    assertCheck(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)), 'run_id inválido');
    return `${sqlLiteral(value)}::uuid`;
}

const env = loadEnv();
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
    assertCheck(env[key], `falta ${key}`);
}
assertCheck(fs.existsSync(BACKUP_PATH), `no existe ${BACKUP_PATH}`);
assertCheck(fs.existsSync(RESOLUTION_MIGRATION_PATH), `no existe ${RESOLUTION_MIGRATION_PATH}`);

const migration = fs.readFileSync(RESOLUTION_MIGRATION_PATH, 'utf8');
const withoutComments = migration
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assertCheck(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+public\./i.test(withoutComments), 'la migración solo puede tocar el ledger privado');

const backupSha256 = crypto.createHash('sha256').update(fs.readFileSync(BACKUP_PATH)).digest('hex');
const endpoint = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
async function query(sql) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Management API ${response.status}: ${body.slice(0, 600)}`);
    return JSON.parse(body);
}

const runRows = await query(`
    select run_id, status, remote_document_count, applied_count
    from ${SCHEMA}.backup_reconciliation_runs
    where backup_sha256 = ${sqlLiteral(backupSha256)}
    order by started_at desc
    limit 1
`);
const run = runRows[0];
assertCheck(run?.status === 'COMMITTED', 'run base no está COMMITTED');
assertCheck(Number(run.applied_count) === 0, 'el run base declara cambios de negocio');
const runId = String(run.run_id);
const runUuid = sqlUuid(runId);

const pendingBeforeRows = await query(`
    select count(*)::int as count
    from ${SCHEMA}.backup_conflict_review_decisions
    where run_id = ${runUuid} and decision = $$PENDING$$
`);
const pendingBefore = Number(pendingBeforeRows[0]?.count);
assertCheck(pendingBefore === 86, `se esperaban 86 decisiones PENDING, llegaron ${pendingBefore}`);

await query(migration);
await query(`
    begin;
    set local lock_timeout = '5s';
    set local statement_timeout = '30s';
    update ${SCHEMA}.backup_conflict_review_decisions
    set decision = $$HOLD$$,
        resolution_code = $$KEEP_BOTH_DUPLICATE$$,
        rationale = ${sqlLiteral('Política seleccionada: conservar ambos documentos cloud; cerrar como duplicado sin borrar ni deduplicar.')},
        approved_by = $$user-policy-selection$$,
        approved_at = clock_timestamp()
    where run_id = ${runUuid} and decision = $$PENDING$$;
    commit;
`);

const [decisionRows, candidateRows, publicRows] = await Promise.all([
    query(`
        select count(*)::int as total,
               count(*) filter(where decision = $$HOLD$$ and resolution_code = $$KEEP_BOTH_DUPLICATE$$)::int as closed,
               count(*) filter(where decision = $$PENDING$$)::int as pending,
               count(*) filter(where approved_keep_remote_row_id is not null)::int as destructive_approvals
        from ${SCHEMA}.backup_conflict_review_decisions
        where run_id = ${runUuid}
    `),
    query(`
        select count(*)::int as candidates,
               count(*) filter(where review_status <> $$PENDING$$)::int as changed_candidate_statuses
        from ${SCHEMA}.backup_conflict_review_candidates
        where run_id = ${runUuid}
    `),
    query(`select count(*)::int as documents from public.sync_documents where collection = $$sale$$`),
]);

const decisions = decisionRows[0];
assertCheck(Number(decisions.total) === 86, 'el ledger no contiene las 86 decisiones');
assertCheck(Number(decisions.closed) === 86, 'no todos los conflictos tienen resolución KEEP_BOTH_DUPLICATE');
assertCheck(Number(decisions.pending) === 0, 'quedaron decisiones PENDING');
assertCheck(Number(decisions.destructive_approvals) === 0, 'existe una aprobación destructiva');
assertCheck(Number(candidateRows[0]?.candidates) === 172, 'los candidatos cambiaron');
assertCheck(Number(candidateRows[0]?.changed_candidate_statuses) === 0, 'se modificó el estado de candidatos');
assertCheck(Number(publicRows[0]?.documents) === Number(run.remote_document_count), 'sync_documents cambió');

console.log(JSON.stringify({
    status: 'COMMITTED_KEEP_BOTH_DUPLICATE',
    run_id: `${runId.slice(0, 8)}…`,
    conflicts_closed: Number(decisions.closed),
    candidates_preserved: Number(candidateRows[0]?.candidates),
    pending_decisions: Number(decisions.pending),
    destructive_approvals: Number(decisions.destructive_approvals),
    applied_business_changes: 0,
}, null, 2));
