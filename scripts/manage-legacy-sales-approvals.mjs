/**
 * Módulo 2 — operador fail-closed para aprobaciones legacy.
 *
 * Por defecto solo consulta. Ninguna venta se asigna por ejecutar este archivo.
 * Las acciones de revisión requieren una fila, candidato, responsable, motivo y
 * confirmación explícita. La aplicación y el rollback requieren confirmaciones
 * distintas y delegan en SQL transaccional ya auditado.
 *
 * Ejemplos:
 *   node scripts/manage-legacy-sales-approvals.mjs status
 *   node scripts/manage-legacy-sales-approvals.mjs list --limit 25
 *   node scripts/manage-legacy-sales-approvals.mjs approve \
 *     --run-id <RUN_ID> --sale-id <SALE_ID> --candidate-user-id <USER_ID> \
 *     --reviewer "responsable" --reason "evidencia revisada" \
 *     --confirm APPROVE_ONE
 *   node scripts/manage-legacy-sales-approvals.mjs apply \
 *     --run-id <RUN_ID> --confirm APPLY_EXPLICIT_APPROVED_MAPPINGS
 *
 * No admite una opción para aprobar masivamente la cola.
 */
import fs from 'node:fs';

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

function fail(message) {
    throw new Error(`LEGACY_APPROVAL_ABORT: ${message}`);
}

function assertCheck(condition, message) {
    if (!condition) fail(message);
}

function parseArgs(argv) {
    const [command = 'status', ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith('--')) fail(`opción inválida: ${token}`);
        const withoutPrefix = token.slice(2);
        const separator = withoutPrefix.indexOf('=');
        if (separator >= 0) {
            options[withoutPrefix.slice(0, separator)] = withoutPrefix.slice(separator + 1);
            continue;
        }
        const next = rest[index + 1];
        if (!next || next.startsWith('--')) {
            options[withoutPrefix] = true;
        } else {
            options[withoutPrefix] = next;
            index += 1;
        }
    }
    return { command, options };
}

function option(options, name) {
    const value = options[name];
    assertCheck(typeof value === 'string' && value.trim() !== '', `falta --${name}`);
    return value.trim();
}

function textOption(options, name, maxLength = 500) {
    const value = option(options, name);
    assertCheck(value.length <= maxLength, `--${name} supera ${maxLength} caracteres`);
    assertCheck(!/[\u0000-\u001f\u007f]/.test(value), `--${name} contiene caracteres de control`);
    return value;
}

function uuidOption(options, name) {
    const value = option(options, name);
    assertCheck(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
        `--${name} no es UUID válido`,
    );
    return value;
}

function sqlText(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function positiveIntegerOption(options, name, fallback, maximum) {
    const raw = options[name] ?? String(fallback);
    assertCheck(/^\d+$/.test(String(raw)), `--${name} debe ser entero`);
    const value = Number(raw);
    assertCheck(Number.isSafeInteger(value) && value >= 0 && value <= maximum, `--${name} fuera de rango`);
    return value;
}

const env = loadEnv();
assertCheck(env.SUPABASE_PROJECT_REF, 'falta SUPABASE_PROJECT_REF en .env');
assertCheck(env.SUPABASE_ACCESS_TOKEN, 'falta SUPABASE_ACCESS_TOKEN en .env');
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
    if (!response.ok) fail(`Management API ${response.status}: ${body.slice(0, 700)}`);
    try {
        return body ? JSON.parse(body) : [];
    } catch {
        fail('respuesta no JSON de Management API');
    }
}

async function status() {
    const [summaryRows, ledgerRows, salesRows, decisionRows] = await Promise.all([
        query('select * from module2_internal.legacy_sales_approval_summary'),
        query(`
            select event_type, count(*)::int as count
            from module2_internal.legacy_sales_approval_ledger
            group by event_type
            order by event_type
        `),
        query(`
            select count(*)::int as total,
                   count(*) filter (where user_id is null)::int as unassigned
            from public.sales
        `),
        query(`
            select decision, count(*)::int as count
            from module2_internal.legacy_sales_assignment_decisions
            group by decision
            order by decision
        `),
    ]);
    console.log(JSON.stringify({
        summary: summaryRows[0] ?? null,
        ledger_events: ledgerRows,
        sales_invariant: salesRows[0] ?? null,
        decisions: decisionRows,
    }, null, 2));
}

async function listQueue(options) {
    const limit = positiveIntegerOption(options, 'limit', 25, 100);
    const offset = positiveIntegerOption(options, 'offset', 0, 1000000);
    const runId = options['run-id'] ? uuidOption(options, 'run-id') : null;
    const runPredicate = runId ? `q.run_id = ${sqlText(runId)}::uuid` : `q.run_id = (
        select run_id from module2_internal.legacy_sales_assignment_runs
        where status in ('PREPARED', 'PARTIALLY_APPLIED')
        order by started_at desc limit 1
    )`;
    const rows = await query(`
        select q.run_id, q.sale_id, q.candidate_user_id, q.candidate_key,
               q.evidence_types, q.source_document_ids, q.evidence_count,
               q.review_status, q.proposed_at, q.reviewer, q.reviewed_at
        from module2_internal.legacy_sales_approval_queue q
        where ${runPredicate}
        order by q.sale_id
        limit ${limit} offset ${offset}
    `);
    console.log(JSON.stringify({ limit, offset, rows }, null, 2));
}

function reviewSql({ action, runId, saleId, candidateUserId, reviewer, reason }) {
    const decision = action === 'approve' ? 'APPROVE' : action === 'reject' ? 'REJECT' : 'HOLD';
    const eventType = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'HOLD';
    const queueStatus = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'HOLD';
    const assignedUser = action === 'approve' ? `${sqlText(candidateUserId)}::uuid` : 'NULL';
    return `
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE
    v_candidate_user_id UUID;
    v_candidate_key TEXT;
    v_queue_hash TEXT;
    v_snapshot_hash TEXT;
    v_review_status TEXT;
BEGIN
    SELECT q.candidate_user_id, q.candidate_key, q.row_hash, q.review_status
      INTO v_candidate_user_id, v_candidate_key, v_queue_hash, v_review_status
    FROM module2_internal.legacy_sales_approval_queue q
    JOIN module2_internal.legacy_sales_assignment_candidates c
      ON c.run_id = q.run_id AND c.sale_id = q.sale_id
     AND c.candidate_user_id = q.candidate_user_id
     AND c.candidate_status = 'PROPOSED_UNIQUE_EXACT'
    WHERE q.run_id = ${sqlText(runId)}::uuid
      AND q.sale_id = ${sqlText(saleId)}::uuid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: fila no es propuesta única exacta';
    END IF;
    IF v_review_status <> 'PENDING' THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: fila ya fue revisada';
    END IF;
    IF v_candidate_user_id IS DISTINCT FROM ${sqlText(candidateUserId)}::uuid THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: candidato no coincide con snapshot de revisión';
    END IF;

    SELECT s.row_hash
      INTO v_snapshot_hash
    FROM module2_internal.legacy_sales_snapshot s
    WHERE s.run_id = ${sqlText(runId)}::uuid
      AND s.sale_id = ${sqlText(saleId)}::uuid;
    IF NOT FOUND OR v_snapshot_hash IS DISTINCT FROM v_queue_hash THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: evidencia de snapshot incompleta';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.id = ${sqlText(saleId)}::uuid
          AND (s.user_id IS NOT NULL OR md5(to_jsonb(s)::text) <> v_snapshot_hash)
    ) THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: public.sales cambió desde el snapshot';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM module2_internal.legacy_sales_assignment_decisions d
        WHERE d.run_id = ${sqlText(runId)}::uuid
          AND d.sale_id = ${sqlText(saleId)}::uuid
    ) THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: ya existe una decisión para la venta';
    END IF;

    INSERT INTO module2_internal.legacy_sales_approval_ledger (
        run_id, sale_id, candidate_user_id, candidate_key, event_type,
        snapshot_row_hash, evidence_types, source_document_ids, reviewer, rationale
    )
    SELECT q.run_id, q.sale_id, q.candidate_user_id, q.candidate_key,
           ${sqlText(eventType)}, q.row_hash, q.evidence_types,
           q.source_document_ids, ${sqlText(reviewer)}, ${sqlText(reason)}
    FROM module2_internal.legacy_sales_approval_queue q
    WHERE q.run_id = ${sqlText(runId)}::uuid
      AND q.sale_id = ${sqlText(saleId)}::uuid;

    INSERT INTO module2_internal.legacy_sales_assignment_decisions (
        run_id, sale_id, decision, assigned_user_id, rationale, approved_by, approved_at
    ) VALUES (
        ${sqlText(runId)}::uuid, ${sqlText(saleId)}::uuid, ${sqlText(decision)},
        ${assignedUser}, ${sqlText(reason)}, ${sqlText(reviewer)}, clock_timestamp()
    );

    UPDATE module2_internal.legacy_sales_approval_queue
    SET review_status = ${sqlText(queueStatus)},
        reviewer = ${sqlText(reviewer)},
        rationale = ${sqlText(reason)},
        reviewed_at = clock_timestamp()
    WHERE run_id = ${sqlText(runId)}::uuid
      AND sale_id = ${sqlText(saleId)}::uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'LEGACY_APPROVAL_ABORT: no se actualizó la cola';
    END IF;
END
$$;
COMMIT;`;
}

async function review(action, options) {
    assertCheck(['approve', 'reject', 'hold'].includes(action), `acción de revisión no soportada: ${action}`);
    assertCheck(options.confirm === 'APPROVE_ONE', 'la revisión requiere --confirm APPROVE_ONE');
    const runId = uuidOption(options, 'run-id');
    const saleId = uuidOption(options, 'sale-id');
    const candidateUserId = uuidOption(options, 'candidate-user-id');
    const reviewer = textOption(options, 'reviewer', 200);
    const reason = textOption(options, 'reason', 2000);
    await query(reviewSql({ action, runId, saleId, candidateUserId, reviewer, reason }));
    console.log(JSON.stringify({ status: 'PASS', action, run_id: runId, sale_id: saleId, business_rows_changed: 0 }, null, 2));
}

async function apply(options) {
    assertCheck(options.confirm === 'APPLY_EXPLICIT_APPROVED_MAPPINGS', 'la aplicación requiere confirmación exacta');
    const runId = uuidOption(options, 'run-id');
    const [rows] = await Promise.all([query(`
        select
            count(*) filter (where d.decision = 'APPROVE')::int as approved,
            count(*) filter (where d.decision <> 'APPROVE')::int as non_approved,
            count(*) filter (where q.review_status <> 'APPROVED')::int as queue_mismatch
        from module2_internal.legacy_sales_assignment_decisions d
        left join module2_internal.legacy_sales_approval_queue q
          on q.run_id = d.run_id and q.sale_id = d.sale_id
        where d.run_id = ${sqlText(runId)}::uuid
    `)]);
    const counts = rows?.[0] ?? {};
    assertCheck(Number(counts.approved) > 0, 'no existen aprobaciones explícitas para aplicar');
    assertCheck(Number(counts.queue_mismatch) === 0, 'hay decisiones aprobadas sin cola APPROVED');
    const applySql = fs.readFileSync('legacy_sales_assignment_apply.sql', 'utf8');
    await query(`select set_config('app.legacy_sales_run_id', ${sqlText(runId)}, false);\n${applySql}`);
    console.log(JSON.stringify({ status: 'PASS', action: 'apply', run_id: runId, approved_rows: Number(counts.approved) }, null, 2));
}

async function rollback(options) {
    assertCheck(options.confirm === 'ROLLBACK_EXPLICIT_LEGACY_ASSIGNMENTS', 'el rollback requiere confirmación exacta');
    const runId = uuidOption(options, 'run-id');
    const rows = await query(`
        select count(*)::int as applied
        from module2_internal.legacy_sales_assignment_apply_log
        where run_id = ${sqlText(runId)}::uuid
          and applied_at is not null
          and rolled_back_at is null
    `);
    const applied = Number(rows?.[0]?.applied ?? 0);
    assertCheck(applied > 0, 'no existen asignaciones aplicadas pendientes de rollback');
    const rollbackSql = fs.readFileSync('legacy_sales_assignment_rollback.sql', 'utf8');
    await query(`select set_config('app.legacy_sales_run_id', ${sqlText(runId)}, false);\n${rollbackSql}`);
    console.log(JSON.stringify({ status: 'PASS', action: 'rollback', run_id: runId, rolled_back_rows: applied }, null, 2));
}

async function main() {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (command === 'status') return status();
    if (command === 'list' || command === 'review') return listQueue(options);
    if (['approve', 'reject', 'hold'].includes(command)) return review(command, options);
    if (command === 'apply') return apply(options);
    if (command === 'rollback') return rollback(options);
    fail(`comando inválido: ${command}`);
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
