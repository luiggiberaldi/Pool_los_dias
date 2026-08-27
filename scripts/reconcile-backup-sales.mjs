/**
 * Reconciliación auditable del backup local contra public.sync_documents.
 *
 * El runner:
 *   1. lee el backup local y calcula hashes canónicos;
 *   2. consulta todos los documentos sale en modo lectura;
 *   3. clasifica exactos, cambios, duplicados ambiguos, faltantes y cloud-only;
 *   4. crea un snapshot privado y un ledger en module2_internal;
 *   5. verifica que public.sync_documents no cambió;
 *   6. no hace INSERT/UPDATE/DELETE sobre datos de negocio.
 *
 * El backup local no se copia al cloud: solo se guarda su hash por venta. El
 * snapshot privado conserva el payload cloud necesario para auditar el run.
 *
 * Ejecutar:
 *   bun scripts/reconcile-backup-sales.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BACKUP_PATH = 'backup_pool_los_diaz_2026-08-19.json';
const MIGRATION_PATH = 'backup_reconciliation_migration.sql';
const SCHEMA = 'module2_internal';

function loadEnv() {
    const values = {};
    if (!fs.existsSync('.env')) return values;
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
        return Object.fromEntries(
            Object.keys(value).sort().map(key => [key, stableValue(value[key])]),
        );
    }
    return value;
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function payloadHash(payload) {
    return sha256(stableJson(payload));
}

function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
    assertCheck(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)), `UUID inválido en snapshot: ${String(value).slice(0, 12)}`);
    return `${sqlLiteral(value)}::uuid`;
}

function sqlTimestamp(value) {
    return value === null || value === undefined ? 'NULL' : `${sqlLiteral(value)}::timestamptz`;
}

function sqlJsonb(value) {
    return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
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
assertCheck(fs.existsSync(MIGRATION_PATH), `no existe ${MIGRATION_PATH}`);

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
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`Management API devolvió una respuesta no JSON (${body.slice(0, 160)})`);
    }
}

const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
const migrationWithoutComments = migration
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assertCheck(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+public\./i.test(migrationWithoutComments), 'la migración privada no puede mutar tablas públicas');

const backupBytes = fs.readFileSync(BACKUP_PATH);
const backupText = backupBytes.toString('utf8');
const backup = JSON.parse(backupText);
const localSales = backup?.data?.idb?.bodega_sales_v1;
assertCheck(Array.isArray(localSales), 'el backup no contiene data.idb.bodega_sales_v1');
assertCheck(localSales.length > 0, 'el backup no contiene ventas');
assertCheck(Number.isFinite(Date.parse(backup.timestamp)), 'timestamp del backup inválido');

const localById = new Map();
for (const sale of localSales) {
    const saleId = String(sale?.id ?? '');
    assertCheck(saleId.length > 0, 'venta local sin id');
    assertCheck(!localById.has(saleId), `venta local duplicada: ${saleId.slice(0, 12)}`);
    localById.set(saleId, sale);
}

const remoteRows = await query(`
    select id, doc_id, user_id, updated_at, data
    from public.sync_documents
    where collection = $$sale$$
    order by id
`);
assertCheck(Array.isArray(remoteRows), 'la consulta cloud no devolvió una lista');
assertCheck(remoteRows.length > 0, 'cloud no contiene documentos sale');

const remoteByDocId = new Map();
for (const row of remoteRows) {
    assertCheck(row?.id && row?.doc_id && row?.user_id, 'documento cloud sin id, doc_id o user_id');
    const payload = row.data?.payload ?? row.data;
    assertCheck(payload && typeof payload === 'object' && !Array.isArray(payload), `payload inválido en ${String(row.doc_id).slice(0, 12)}`);
    assertCheck(String(payload.id ?? '') === String(row.doc_id), `doc_id y payload.id no coinciden en ${String(row.doc_id).slice(0, 12)}`);
    const entry = {
        id: row.id,
        doc_id: String(row.doc_id),
        user_id: String(row.user_id),
        updated_at: row.updated_at ?? null,
        data: row.data,
        payload,
        payload_hash: payloadHash(payload),
        remote_row_hash: payloadHash({
            id: row.id,
            doc_id: row.doc_id,
            user_id: row.user_id,
            updated_at: row.updated_at ?? null,
            data: row.data,
        }),
    };
    if (!remoteByDocId.has(entry.doc_id)) remoteByDocId.set(entry.doc_id, []);
    remoteByDocId.get(entry.doc_id).push(entry);
}

const classifications = [];
const changedFieldCounts = {};
const changedFieldsFor = (localSale, remoteEntries) => {
    const fields = new Set();
    for (const remote of remoteEntries) {
        for (const key of new Set([...Object.keys(localSale || {}), ...Object.keys(remote.payload || {})])) {
            if (stableJson(localSale?.[key]) !== stableJson(remote.payload?.[key])) fields.add(key);
        }
    }
    return [...fields].sort();
};

for (const [saleId, localSale] of localById) {
    const remoteEntries = remoteByDocId.get(saleId) ?? [];
    const remoteDocIds = remoteEntries.map(entry => entry.doc_id);
    const remoteUserIds = remoteEntries.map(entry => entry.user_id);
    const remoteHashes = remoteEntries.map(entry => entry.payload_hash);

    if (remoteEntries.length === 0) {
        classifications.push({
            sale_id: saleId,
            classification: 'MISSING_FROM_CLOUD',
            action: 'HOLD_MISSING',
            backup_payload_hash: payloadHash(localSale),
            remote_entries: remoteEntries,
            changed_fields: [],
            reason: 'La venta local no tiene documento cloud; se retiene porque no existe regla autorizada para crear propietario o documento.',
        });
        continue;
    }

    if (remoteEntries.length > 1) {
        const changedFields = changedFieldsFor(localSale, remoteEntries);
        for (const field of changedFields) changedFieldCounts[field] = (changedFieldCounts[field] || 0) + 1;
        classifications.push({
            sale_id: saleId,
            classification: 'AMBIGUOUS_DUPLICATE',
            action: 'HOLD_AMBIGUOUS',
            backup_payload_hash: payloadHash(localSale),
            remote_entries: remoteEntries,
            changed_fields: ['duplicate_remote_documents', ...changedFields],
            reason: 'Existen varios documentos cloud para el mismo id con más de un propietario; no se elige una cuenta automáticamente.',
        });
        continue;
    }

    const remote = remoteEntries[0];
    const localHash = payloadHash(localSale);
    if (localHash === remote.payload_hash) {
        classifications.push({
            sale_id: saleId,
            classification: 'EXACT_SINGLE',
            action: 'NOOP_EXACT',
            backup_payload_hash: localHash,
            remote_entries: remoteEntries,
            changed_fields: [],
            reason: 'El payload local coincide con el único documento cloud; no hay cambio que aplicar.',
        });
    } else {
        const changedFields = changedFieldsFor(localSale, remoteEntries);
        for (const field of changedFields) changedFieldCounts[field] = (changedFieldCounts[field] || 0) + 1;
        classifications.push({
            sale_id: saleId,
            classification: 'CHANGED_SINGLE',
            action: 'HOLD_CHANGED',
            backup_payload_hash: localHash,
            remote_entries: remoteEntries,
            changed_fields: changedFields,
            reason: 'El documento cloud único difiere del backup; se conserva la versión cloud y se retiene la decisión.',
        });
    }
}

for (const [saleId, remoteEntries] of remoteByDocId) {
    if (localById.has(saleId)) continue;
    const duplicate = remoteEntries.length > 1;
    classifications.push({
        sale_id: saleId,
        classification: duplicate ? 'CLOUD_ONLY_DUPLICATE' : 'CLOUD_ONLY',
        action: duplicate ? 'PRESERVE_CLOUD_DUPLICATE' : 'PRESERVE_CLOUD',
        backup_payload_hash: null,
        remote_entries: remoteEntries,
        changed_fields: [],
        reason: duplicate
            ? 'Documento cloud sin equivalente local y con duplicidad; se preservan todos sus propietarios y payloads.'
            : 'Documento cloud creado después o fuera del backup; se preserva sin sobrescribirlo.',
    });
}

const countClassification = classification => classifications.filter(row => row.classification === classification).length;
const exactCount = countClassification('EXACT_SINGLE');
const changedCount = countClassification('CHANGED_SINGLE');
const ambiguousCount = countClassification('AMBIGUOUS_DUPLICATE');
const missingCount = countClassification('MISSING_FROM_CLOUD');
const cloudOnlyCount = countClassification('CLOUD_ONLY') + countClassification('CLOUD_ONLY_DUPLICATE');
const cloudOnlyDocumentCount = classifications
    .filter(row => row.classification === 'CLOUD_ONLY' || row.classification === 'CLOUD_ONLY_DUPLICATE')
    .reduce((total, row) => total + row.remote_entries.length, 0);
const remoteUniqueCount = remoteByDocId.size;
const backupSha256 = sha256(backupBytes);
const runId = crypto.randomUUID();
const baseline = {
    documents: remoteRows.length,
    uniqueDocs: remoteUniqueCount,
};

// La reconciliación no tiene una mutación de negocio segura: los exactos ya
// están iguales y los restantes requieren retención. Esto es deliberado.
const appliedCount = 0;
assertCheck(appliedCount === 0, 'esta reconciliación no puede aplicar cambios de negocio');

await query(migration);
await query(`
    insert into ${SCHEMA}.backup_reconciliation_runs (
        run_id, backup_filename, backup_sha256, backup_timestamp,
        backup_sales_count, remote_document_count, remote_unique_sale_count,
        exact_count, changed_count, ambiguous_count, missing_count,
        cloud_only_count, cloud_only_document_count, applied_count, status, notes
    ) values (
        ${sqlUuid(runId)},
        ${sqlLiteral(BACKUP_PATH)},
        ${sqlLiteral(backupSha256)},
        ${sqlTimestamp(backup.timestamp)},
        ${localSales.length},
        ${remoteRows.length},
        ${remoteUniqueCount},
        ${exactCount},
        ${changedCount},
        ${ambiguousCount},
        ${missingCount},
        ${cloudOnlyCount},
        ${cloudOnlyDocumentCount},
        0,
        $$PREPARED$$,
        ${sqlLiteral('Snapshot privado y ledger preparados; no se modifican tablas de negocio.')}
    )
`);

try {
    const localManifestRows = [...localById.entries()].map(([saleId, sale]) => `(
        ${sqlUuid(runId)},
        ${sqlLiteral(saleId)},
        ${sqlLiteral(payloadHash(sale))}
    )`);
    for (const batch of chunk(localManifestRows, 250)) {
        await query(`
            insert into ${SCHEMA}.backup_reconciliation_local_manifest
                (run_id, sale_id, backup_payload_hash)
            values ${batch.join(',')}
            on conflict (run_id, sale_id) do nothing
        `);
    }

    const remoteSnapshotRows = [];
    for (const [docId, entries] of remoteByDocId) {
        for (const entry of entries) {
            remoteSnapshotRows.push(`(
                ${sqlUuid(runId)},
                ${sqlUuid(entry.id)},
                ${sqlLiteral(docId)},
                ${sqlUuid(entry.user_id)},
                ${sqlTimestamp(entry.updated_at)},
                ${sqlJsonb(entry.payload)},
                ${sqlLiteral(entry.payload_hash)},
                ${sqlLiteral(entry.remote_row_hash)},
                ${entries.length}
            )`);
        }
    }
    for (const batch of chunk(remoteSnapshotRows, 20)) {
        await query(`
            insert into ${SCHEMA}.backup_reconciliation_remote_snapshot (
                run_id, remote_row_id, doc_id, user_id, updated_at, payload,
                payload_hash, remote_row_hash, duplicate_group_size
            ) values ${batch.join(',')}
            on conflict (run_id, remote_row_id) do nothing
        `);
    }

    const ledgerRows = classifications
        .sort((a, b) => a.sale_id.localeCompare(b.sale_id))
        .map(row => {
            const remoteDocIds = row.remote_entries.map(entry => entry.doc_id);
            const remoteUserIds = row.remote_entries.map(entry => entry.user_id);
            const remoteHashes = row.remote_entries.map(entry => entry.payload_hash);
            return `(
                ${sqlUuid(runId)},
                ${sqlLiteral(row.sale_id)},
                ${sqlLiteral(row.classification)},
                ${sqlLiteral(row.action)},
                ${row.backup_payload_hash ? sqlLiteral(row.backup_payload_hash) : 'NULL'},
                ${row.remote_entries.length},
                ${sqlTextArray(remoteDocIds)},
                ${sqlTextArray(remoteUserIds)},
                ${sqlTextArray(remoteHashes)},
                ${sqlTextArray(row.changed_fields)},
                ${sqlLiteral(row.reason)}
            )`;
        });
    for (const batch of chunk(ledgerRows, 150)) {
        await query(`
            insert into ${SCHEMA}.backup_reconciliation_ledger (
                run_id, sale_id, classification, action, backup_payload_hash,
                remote_document_count, remote_doc_ids, remote_user_ids,
                remote_payload_hashes, changed_fields, reason
            ) values ${batch.join(',')}
            on conflict (run_id, sale_id) do nothing
        `);
    }

    const [runRows, manifestRows, snapshotRows, ledgerRowsCount, currentRemoteRows] = await Promise.all([
        query(`
            select run_id, status, backup_sales_count, remote_document_count,
                   remote_unique_sale_count, exact_count, changed_count,
                   ambiguous_count, missing_count, cloud_only_count,
                   cloud_only_document_count, applied_count
            from ${SCHEMA}.backup_reconciliation_runs
            where run_id = ${sqlUuid(runId)}
        `),
        query(`select count(*)::int as count from ${SCHEMA}.backup_reconciliation_local_manifest where run_id = ${sqlUuid(runId)}`),
        query(`select count(*)::int as count from ${SCHEMA}.backup_reconciliation_remote_snapshot where run_id = ${sqlUuid(runId)}`),
        query(`select count(*)::int as count from ${SCHEMA}.backup_reconciliation_ledger where run_id = ${sqlUuid(runId)}`),
        query(`select count(*)::int as documents, count(distinct doc_id)::int as unique_docs from public.sync_documents where collection = $$sale$$`),
    ]);

    const run = runRows[0];
    assertCheck(run?.status === 'PREPARED', 'el run no quedó preparado');
    assertCheck(Number(manifestRows[0]?.count) === localSales.length, 'manifest local incompleto');
    assertCheck(Number(snapshotRows[0]?.count) === remoteRows.length, 'snapshot cloud incompleto');
    assertCheck(Number(ledgerRowsCount[0]?.count) === classifications.length, 'ledger incompleto');
    assertCheck(Number(currentRemoteRows[0]?.documents) === baseline.documents, 'sync_documents cambió durante la reconciliación');
    assertCheck(Number(currentRemoteRows[0]?.unique_docs) === baseline.uniqueDocs, 'la unicidad cloud cambió durante la reconciliación');
    assertCheck(Number(run.applied_count) === 0, 'el run declara cambios de negocio');

    await query(`
        update ${SCHEMA}.backup_reconciliation_runs
        set completed_at = clock_timestamp(), status = $$COMMITTED$$,
            notes = ${sqlLiteral('Comparación completa. Exactos marcados como NOOP; cambios, duplicados y cloud-only preservados sin mutación de negocio.')}
        where run_id = ${sqlUuid(runId)} and status = $$PREPARED$$ and applied_count = 0
    `);

    const result = {
        run_id: runId,
        backup_sha256: backupSha256,
        backup_timestamp: backup.timestamp,
        backup_sales: localSales.length,
        cloud_documents: remoteRows.length,
        cloud_unique_sale_ids: remoteUniqueCount,
        exact_single_noop: exactCount,
        changed_single_held: changedCount,
        ambiguous_duplicate_held: ambiguousCount,
        missing_from_cloud_held: missingCount,
        cloud_only_preserved: cloudOnlyCount,
        cloud_only_documents_preserved: cloudOnlyDocumentCount,
        applied_business_changes: appliedCount,
        changed_field_counts: changedFieldCounts,
        status: 'COMMITTED',
    };
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    await query(`
        update ${SCHEMA}.backup_reconciliation_runs
        set completed_at = clock_timestamp(), status = $$ABORTED$$,
            notes = ${sqlLiteral(`Run abortado antes de confirmar; no se aplicaron cambios de negocio. ${String(error.message).slice(0, 300)}`)}
        where run_id = ${sqlUuid(runId)} and status = $$PREPARED$$
    `).catch(() => {});
    throw error;
}
