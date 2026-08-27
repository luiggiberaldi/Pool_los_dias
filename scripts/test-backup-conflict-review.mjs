/**
 * Pruebas read-only de la cola de revisión de conflictos del backup.
 *
 * Ejecutar:
 *   bun scripts/test-backup-conflict-review.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BACKUP_PATH = 'backup_pool_los_diaz_2026-08-19.json';
const reviewFiles = [
    'backup_conflict_review_migration.sql',
    'scripts/prepare-backup-conflict-review.mjs',
];

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

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

for (const file of reviewFiles) {
    assertCheck(fs.existsSync(file), `falta ${file}`);
    const source = fs.readFileSync(file, 'utf8')
        .replace(/--[^\r\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assertCheck(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:ONLY\s+)?public\./i.test(source), `${file} no muta tablas públicas`);
}

const env = loadEnv();
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
    assertCheck(env[key], `falta ${key}`);
}

const backupBytes = fs.readFileSync(BACKUP_PATH);
const backupSha256 = sha256(backupBytes);
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
    if (!response.ok) throw new Error(`Management API ${response.status}: ${body.slice(0, 500)}`);
    return JSON.parse(body);
}

const runRows = await query(`
    select run_id, status, remote_document_count, applied_count
    from module2_internal.backup_reconciliation_runs
    where backup_sha256 = ${sqlLiteral(backupSha256)}
    order by started_at desc
    limit 1
`);
const run = runRows[0];
assertCheck(run?.status === 'COMMITTED', 'run base no está COMMITTED');
assertCheck(Number(run.applied_count) === 0, 'run base declara cambios de negocio');
const runId = String(run.run_id);
assertCheck(/^[0-9a-f-]{36}$/i.test(runId), 'run_id inválido');

const [candidateRows, decisionRows, invalidRows, unsafeRows, publicRows, snapshotIntegrityRows] = await Promise.all([
    query(`
        select count(*)::int as count,
               count(*) filter(where payload_matches_backup)::int as exact_matches
        from module2_internal.backup_conflict_review_candidates
        where run_id = ${sqlLiteral(runId)}::uuid
    `),
    query(`
        select count(*)::int as count,
               count(*) filter(where decision = $$PENDING$$)::int as pending,
               count(*) filter(where decision = $$HOLD$$ and resolution_code = $$KEEP_BOTH_DUPLICATE$$)::int as closed,
               count(*) filter(where decision <> $$PENDING$$)::int as decided
        from module2_internal.backup_conflict_review_decisions
        where run_id = ${sqlLiteral(runId)}::uuid
    `),
    query(`
        select count(*)::int as count
        from (
            select sale_id
            from module2_internal.backup_conflict_review_candidates
            where run_id = ${sqlLiteral(runId)}::uuid
            group by sale_id
            having count(*) <> 2
                or count(*) filter(where payload_matches_backup) <> 1
        ) invalid
    `),
    query(`
        select count(*)::int as count
        from module2_internal.backup_conflict_review_decisions d
        left join module2_internal.backup_conflict_review_candidates c
          on c.run_id = d.run_id
         and c.remote_row_id = d.proposed_keep_remote_row_id
         and c.payload_matches_backup = true
        where d.run_id = ${sqlLiteral(runId)}::uuid
          and (d.decision <> $$HOLD$$
            or d.resolution_code <> $$KEEP_BOTH_DUPLICATE$$
            or d.approved_keep_remote_row_id is not null
            or (d.proposed_keep_remote_row_id is not null and c.remote_row_id is null))
    `),
    query(`
        select count(*)::int as documents
        from public.sync_documents
        where collection = $$sale$$
    `),
    query(`
        select count(*)::int as snapshot_rows,
               count(d.id)::int as present_rows,
               count(*) filter (where d.id is not null and s.user_id = d.user_id)::int as same_owner_rows,
               count(*) filter (where d.id is not null and s.payload <> d.data->$$payload$$)::int as changed_payload_rows
        from module2_internal.backup_reconciliation_remote_snapshot s
        left join public.sync_documents d
          on d.id = s.remote_row_id
         and d.collection = $$sale$$
        where s.run_id = ${sqlLiteral(runId)}::uuid
    `),
]);

assertCheck(Number(candidateRows[0]?.count) === 172, 'no están los 172 candidatos');
assertCheck(Number(candidateRows[0]?.exact_matches) === 86, 'las propuestas exactas no son 86');
assertCheck(Number(decisionRows[0]?.count) === 86, 'no están las 86 decisiones');
assertCheck(Number(decisionRows[0]?.closed) === 86, 'no están cerradas como KEEP_BOTH_DUPLICATE');
assertCheck(Number(decisionRows[0]?.pending) === 0, 'quedaron decisiones PENDING');
assertCheck(Number(decisionRows[0]?.decided) === 86, 'el conteo de decisiones cerradas es inconsistente');
assertCheck(Number(invalidRows[0]?.count) === 0, 'algún conflicto no tiene exactamente un candidato exacto');
assertCheck(Number(unsafeRows[0]?.count) === 0, 'la cola contiene una decisión insegura');
assertCheck(Number(snapshotIntegrityRows[0]?.snapshot_rows) === Number(run.remote_document_count), 'snapshot histórico incompleto');
assertCheck(Number(snapshotIntegrityRows[0]?.present_rows) === Number(run.remote_document_count), 'un documento del snapshot ya no existe');
assertCheck(Number(snapshotIntegrityRows[0]?.same_owner_rows) === Number(run.remote_document_count), 'un propietario del snapshot cambió');
assertCheck(Number(publicRows[0]?.documents) >= Number(run.remote_document_count), 'cloud perdió documentos del snapshot');

console.log(JSON.stringify({
    status: 'PASS',
    run_id: `${runId.slice(0, 8)}…`,
    conflict_groups: Number(decisionRows[0]?.count),
    candidate_rows: Number(candidateRows[0]?.count),
    exact_backup_proposals: Number(candidateRows[0]?.exact_matches),
    closed_keep_both_decisions: Number(decisionRows[0]?.closed),
    pending_decisions: Number(decisionRows[0]?.pending),
    current_cloud_documents: Number(publicRows[0]?.documents),
    post_run_documents: Number(publicRows[0]?.documents) - Number(run.remote_document_count),
    post_run_payload_changes: Number(snapshotIntegrityRows[0]?.changed_payload_rows),
    applied_business_changes: 0,
}, null, 2));
