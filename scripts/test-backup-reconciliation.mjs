/**
 * Pruebas read-only del run de reconciliación del backup.
 *
 * Ejecutar:
 *   bun scripts/test-backup-reconciliation.mjs
 *
 * No inserta decisiones y no modifica public.sync_documents ni public.sales.
 * El snapshot es histórico: cambios posteriores en payloads se reportan, no se
 * interpretan como corrupción del snapshot ni se revierten automáticamente.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BACKUP_PATH = 'backup_pool_los_diaz_2026-08-19.json';
const filesToCheck = [
    'backup_reconciliation_migration.sql',
    'backup_reconciliation_rollback.sql',
    'scripts/reconcile-backup-sales.mjs',
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

function literal(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

for (const file of filesToCheck) {
    assertCheck(fs.existsSync(file), `falta ${file}`);
    const source = fs.readFileSync(file, 'utf8');
    const withoutComments = source
        .replace(/--[^\r\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assertCheck(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:ONLY\s+)?public\./i.test(withoutComments), `${file} no muta tablas públicas`);
}

const env = loadEnv();
for (const key of ['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']) {
    assertCheck(env[key], `falta ${key}`);
}

const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
const localSales = backup?.data?.idb?.bodega_sales_v1;
assertCheck(Array.isArray(localSales), 'backup sales inválido');
const backupSha256 = sha256(fs.readFileSync(BACKUP_PATH));

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
    select run_id, status, backup_sha256, backup_sales_count,
           remote_document_count, remote_unique_sale_count, exact_count,
           changed_count, ambiguous_count, missing_count, cloud_only_count,
           cloud_only_document_count, applied_count
    from module2_internal.backup_reconciliation_runs
    where backup_sha256 = ${literal(backupSha256)}
    order by started_at desc
    limit 1
`);
const run = runRows[0];
assertCheck(run, 'no existe un run para este hash de backup');
assertCheck(run.status === 'COMMITTED', 'el run más reciente no está COMMITTED');
assertCheck(run.backup_sha256 === backupSha256, 'hash del backup no coincide');
assertCheck(Number(run.backup_sales_count) === localSales.length, 'conteo local no coincide con el run');
assertCheck(Number(run.applied_count) === 0, 'el run declara cambios de negocio');

const runId = String(run.run_id);
assertCheck(/^[0-9a-f-]{36}$/i.test(runId), 'run_id inválido');
const [manifestRows, snapshotRows, ledgerRows, classificationRows, remoteRows, snapshotIntegrityRows, unsafeRows] = await Promise.all([
    query(`select count(*)::int as count from module2_internal.backup_reconciliation_local_manifest where run_id = ${literal(runId)}::uuid`),
    query(`select count(*)::int as count from module2_internal.backup_reconciliation_remote_snapshot where run_id = ${literal(runId)}::uuid`),
    query(`select count(*)::int as count from module2_internal.backup_reconciliation_ledger where run_id = ${literal(runId)}::uuid`),
    query(`
        select classification, count(*)::int as count
        from module2_internal.backup_reconciliation_ledger
        where run_id = ${literal(runId)}::uuid
        group by classification
    `),
    query(`select count(*)::int as documents, count(distinct doc_id)::int as unique_docs from public.sync_documents where collection = $$sale$$`),
    query(`
        select count(*)::int as snapshot_rows,
               count(d.id)::int as present_rows,
               count(*) filter (where d.id is not null and s.user_id = d.user_id)::int as same_owner_rows,
               count(*) filter (where d.id is not null and s.payload <> d.data->$$payload$$)::int as changed_payload_rows
        from module2_internal.backup_reconciliation_remote_snapshot s
        left join public.sync_documents d
          on d.id = s.remote_row_id
         and d.collection = $$sale$$
        where s.run_id = ${literal(runId)}::uuid
    `),
    query(`
        select count(*)::int as count
        from module2_internal.backup_reconciliation_ledger
        where run_id = ${literal(runId)}::uuid
          and ((classification = $$AMBIGUOUS_DUPLICATE$$ and remote_document_count < 2)
            or (classification = $$EXACT_SINGLE$$ and action <> $$NOOP_EXACT$$)
            or (classification = $$CHANGED_SINGLE$$ and action <> $$HOLD_CHANGED$$)
            or (classification = $$CLOUD_ONLY$$ and action <> $$PRESERVE_CLOUD$$)
            or (classification = $$CLOUD_ONLY_DUPLICATE$$ and action <> $$PRESERVE_CLOUD_DUPLICATE$$))
    `),
]);

const classificationCounts = Object.fromEntries(
    classificationRows.map(row => [row.classification, Number(row.count)]),
);
const localClassified = ['EXACT_SINGLE', 'CHANGED_SINGLE', 'AMBIGUOUS_DUPLICATE', 'MISSING_FROM_CLOUD']
    .reduce((total, key) => total + (classificationCounts[key] || 0), 0);
const cloudOnlyClassified = (classificationCounts.CLOUD_ONLY || 0) + (classificationCounts.CLOUD_ONLY_DUPLICATE || 0);

assertCheck(Number(manifestRows[0]?.count) === localSales.length, 'manifest local incompleto');
assertCheck(Number(snapshotRows[0]?.count) === Number(run.remote_document_count), 'snapshot cloud incompleto');
assertCheck(Number(ledgerRows[0]?.count) === Number(run.remote_unique_sale_count), 'ledger no cubre ids únicos');
assertCheck(localClassified === localSales.length, 'no todas las ventas locales tienen clasificación');
assertCheck(cloudOnlyClassified === Number(run.cloud_only_count), 'cloud-only no coincide con el run');
assertCheck(Number(snapshotIntegrityRows[0]?.snapshot_rows) === Number(run.remote_document_count), 'snapshot histórico incompleto');
assertCheck(Number(snapshotIntegrityRows[0]?.present_rows) === Number(run.remote_document_count), 'un documento del snapshot ya no existe en cloud');
assertCheck(Number(snapshotIntegrityRows[0]?.same_owner_rows) === Number(run.remote_document_count), 'un propietario del snapshot cambió');
assertCheck(Number(remoteRows[0]?.documents) >= Number(run.remote_document_count), 'cloud perdió documentos del snapshot');
assertCheck(Number(remoteRows[0]?.unique_docs) >= Number(run.remote_unique_sale_count), 'cloud perdió ids del snapshot');
assertCheck(Number(unsafeRows[0]?.count) === 0, 'ledger contiene una acción incompatible con su clasificación');
assertCheck(Number(run.exact_count) === (classificationCounts.EXACT_SINGLE || 0), 'exact_count inconsistente');
assertCheck(Number(run.changed_count) === (classificationCounts.CHANGED_SINGLE || 0), 'changed_count inconsistente');
assertCheck(Number(run.ambiguous_count) === (classificationCounts.AMBIGUOUS_DUPLICATE || 0), 'ambiguous_count inconsistente');
assertCheck(Number(run.missing_count) === (classificationCounts.MISSING_FROM_CLOUD || 0), 'missing_count inconsistente');

console.log(JSON.stringify({
    status: 'PASS',
    run_id: `${runId.slice(0, 8)}…`,
    backup_sales: localSales.length,
    cloud_documents: Number(run.remote_document_count),
    cloud_unique_sale_ids_at_snapshot: Number(run.remote_unique_sale_count),
    cloud_documents_current: Number(remoteRows[0]?.documents),
    cloud_unique_sale_ids_current: Number(remoteRows[0]?.unique_docs),
    post_run_documents: Number(remoteRows[0]?.documents) - Number(run.remote_document_count),
    post_run_unique_sale_ids: Number(remoteRows[0]?.unique_docs) - Number(run.remote_unique_sale_count),
    post_run_payload_changes: Number(snapshotIntegrityRows[0]?.changed_payload_rows),
    status_detail: Number(snapshotIntegrityRows[0]?.changed_payload_rows) > 0
        ? 'PASS_WITH_POST_RUN_CLOUD_CHANGES'
        : 'PASS_SNAPSHOT_INTACT',
    classification_counts: classificationCounts,
    applied_business_changes: Number(run.applied_count),
}, null, 2));
