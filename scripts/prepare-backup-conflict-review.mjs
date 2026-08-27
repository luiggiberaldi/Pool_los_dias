/**
 * Prepara la revisión explícita de conflictos duplicados del backup.
 *
 * La evidencia se genera automáticamente, pero ninguna decisión se aprueba:
 *   - un candidato que coincide exactamente con el backup queda propuesto;
 *   - el candidato alternativo queda como BACKUP_NON_MATCH;
 *   - la decisión de cada venta permanece PENDING.
 *
 * No modifica public.sync_documents ni ninguna tabla de negocio.
 *
 * Ejecutar:
 *   bun scripts/prepare-backup-conflict-review.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BACKUP_PATH = 'backup_pool_los_diaz_2026-08-19.json';
const REVIEW_MIGRATION_PATH = 'backup_conflict_review_migration.sql';
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

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
    }
    return value;
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
    assertCheck(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)), `UUID inválido: ${String(value).slice(0, 12)}`);
    return `${sqlLiteral(value)}::uuid`;
}

function sqlTimestamp(value) {
    return value === null || value === undefined ? 'NULL' : `${sqlLiteral(value)}::timestamptz`;
}

function sqlTextArray(values) {
    if (!values?.length) return 'ARRAY[]::TEXT[]';
    return `ARRAY[${values.map(sqlLiteral).join(',')}]::TEXT[]`;
}

function chunk(items, size) {
    const batches = [];
    for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
    return batches;
}

const env = loadEnv();
assertCheck(env.SUPABASE_PROJECT_REF, 'falta SUPABASE_PROJECT_REF');
assertCheck(env.SUPABASE_ACCESS_TOKEN, 'falta SUPABASE_ACCESS_TOKEN');
assertCheck(fs.existsSync(BACKUP_PATH), `no existe ${BACKUP_PATH}`);
assertCheck(fs.existsSync(REVIEW_MIGRATION_PATH), `no existe ${REVIEW_MIGRATION_PATH}`);

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

const migration = fs.readFileSync(REVIEW_MIGRATION_PATH, 'utf8');
const migrationWithoutComments = migration
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assertCheck(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+public\./i.test(migrationWithoutComments), 'la migración de revisión no muta tablas públicas');

const backupBytes = fs.readFileSync(BACKUP_PATH);
const backup = JSON.parse(backupBytes.toString('utf8'));
const localSales = backup?.data?.idb?.bodega_sales_v1;
assertCheck(Array.isArray(localSales), 'backup sales inválido');
const localById = new Map(localSales.map(sale => [String(sale.id), sale]));
const backupSha256 = sha256(backupBytes);

const runs = await query(`
    select run_id, status, backup_sha256
    from ${SCHEMA}.backup_reconciliation_runs
    where backup_sha256 = ${sqlLiteral(backupSha256)}
    order by started_at desc
    limit 1
`);
const run = runs[0];
assertCheck(run?.status === 'COMMITTED', 'no existe un run COMMITTED para este backup');
const runId = String(run.run_id);

const snapshotRows = await query(`
    select doc_id, remote_row_id, user_id, updated_at, payload, payload_hash
    from ${SCHEMA}.backup_reconciliation_remote_snapshot
    where run_id = ${sqlUuid(runId)} and duplicate_group_size > 1
    order by doc_id, updated_at desc nulls last
`);
assertCheck(snapshotRows.length > 0, 'no hay conflictos duplicados para revisar');

const groups = new Map();
for (const row of snapshotRows) {
    if (!groups.has(row.doc_id)) groups.set(row.doc_id, []);
    groups.get(row.doc_id).push(row);
}

const changedFieldsFor = (localSale, candidatePayload) => {
    const fields = [];
    for (const key of new Set([...Object.keys(localSale || {}), ...Object.keys(candidatePayload || {})])) {
        if (stableJson(localSale?.[key]) !== stableJson(candidatePayload?.[key])) fields.push(key);
    }
    return fields.sort();
};

const candidateRows = [];
const decisionRows = [];
let exactProposals = 0;
const matchingOwners = new Set();

for (const [saleId, candidates] of groups) {
    const localSale = localById.get(saleId);
    assertCheck(localSale, `conflicto cloud sin venta local en ${saleId.slice(0, 12)}`);
    assertCheck(candidates.length > 1, `conflicto sin duplicidad real en ${saleId.slice(0, 12)}`);

    const localHash = sha256(stableJson(localSale));
    const matches = candidates.filter(candidate => candidate.payload_hash === localHash);
    const proposed = matches.length === 1 ? matches[0] : null;
    if (proposed) {
        exactProposals += 1;
        matchingOwners.add(proposed.user_id);
    }

    for (const candidate of candidates) {
        const matchesBackup = candidate.payload_hash === localHash;
        candidateRows.push(`(
            ${sqlUuid(runId)},
            ${sqlLiteral(saleId)},
            ${sqlUuid(candidate.remote_row_id)},
            ${sqlLiteral(candidate.doc_id)},
            ${sqlUuid(candidate.user_id)},
            ${sqlTimestamp(candidate.updated_at)},
            ${sqlLiteral(localHash)},
            ${sqlLiteral(candidate.payload_hash)},
            ${matchesBackup ? 'true' : 'false'},
            ${sqlLiteral(matchesBackup ? 'BACKUP_EXACT_MATCH' : 'BACKUP_NON_MATCH')},
            ${sqlTextArray(matchesBackup ? [] : changedFieldsFor(localSale, candidate.payload))}
        )`);
    }

    decisionRows.push(`(
        ${sqlUuid(runId)},
        ${sqlLiteral(saleId)},
        $$PENDING$$,
        ${proposed ? sqlUuid(proposed.remote_row_id) : 'NULL'},
        NULL,
        ${sqlLiteral(proposed
            ? 'Propuesta automática basada en una coincidencia exacta única con el backup; requiere aprobación explícita.'
            : 'No existe un candidato exacto único; requiere escalamiento manual.')},
        NULL,
        NULL
    )`);
}

await query(migration);
for (const batch of chunk(candidateRows, 80)) {
    await query(`
        insert into ${SCHEMA}.backup_conflict_review_candidates (
            run_id, sale_id, remote_row_id, doc_id, candidate_user_id,
            candidate_updated_at, backup_payload_hash, candidate_payload_hash,
            payload_matches_backup, evidence_code, changed_fields
        ) values ${batch.join(',')}
        on conflict (run_id, remote_row_id) do nothing
    `);
}
for (const batch of chunk(decisionRows, 80)) {
    await query(`
        insert into ${SCHEMA}.backup_conflict_review_decisions (
            run_id, sale_id, decision, proposed_keep_remote_row_id,
            approved_keep_remote_row_id, rationale, approved_by, approved_at
        ) values ${batch.join(',')}
        on conflict (run_id, sale_id) do nothing
    `);
}

const [candidateCountRows, decisionCountRows, pendingRows, invalidProposalRows] = await Promise.all([
    query(`select count(*)::int as count from ${SCHEMA}.backup_conflict_review_candidates where run_id = ${sqlUuid(runId)}`),
    query(`select count(*)::int as count from ${SCHEMA}.backup_conflict_review_decisions where run_id = ${sqlUuid(runId)}`),
    query(`
        select count(*) filter(where decision = $$PENDING$$)::int as pending,
               count(*) filter(where decision = $$HOLD$$ and resolution_code = $$KEEP_BOTH_DUPLICATE$$)::int as closed
        from ${SCHEMA}.backup_conflict_review_decisions
        where run_id = ${sqlUuid(runId)}
    `),
    query(`
        select count(*)::int as count
        from ${SCHEMA}.backup_conflict_review_decisions d
        left join ${SCHEMA}.backup_conflict_review_candidates c
          on c.run_id = d.run_id
         and c.remote_row_id = d.proposed_keep_remote_row_id
         and c.payload_matches_backup = true
        where d.run_id = ${sqlUuid(runId)}
          and d.proposed_keep_remote_row_id is not null
          and c.remote_row_id is null
    `),
]);

assertCheck(Number(candidateCountRows[0]?.count) === snapshotRows.length, 'candidatos de revisión incompletos');
assertCheck(Number(decisionCountRows[0]?.count) === groups.size, 'decisiones de revisión incompletas');
const pendingDecisions = Number(pendingRows[0]?.pending || 0);
const closedDecisions = Number(pendingRows[0]?.closed || 0);
assertCheck(pendingDecisions + closedDecisions === groups.size, 'el estado de decisiones no cubre todos los conflictos');
assertCheck(Number(invalidProposalRows[0]?.count) === 0, 'hay propuestas que no coinciden con el backup');

console.log(JSON.stringify({
    status: 'COMMITTED_REVIEW_QUEUE',
    run_id: `${runId.slice(0, 8)}…`,
    conflict_groups: groups.size,
    candidate_rows: snapshotRows.length,
    exact_backup_proposals: exactProposals,
    non_matching_candidates: snapshotRows.length - exactProposals,
    matching_owner_count: matchingOwners.size,
    pending_decisions: pendingDecisions,
    closed_keep_both_decisions: closedDecisions,
    applied_business_changes: 0,
}, null, 2));
