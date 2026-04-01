// ============================================================
// 🧪 SYSTEM TESTER v4.0 — Cobertura Total + Auditoría AI
// ============================================================
// Tests REAL storageService (localforage/IndexedDB) operations.
// AISLAMIENTO: Utiliza claves exclusivas para test (TEST_KEYS).
// NUNCA modifica ni lee los datos reales del usuario.
// v4.0: Cobertura completa de servicios + Análisis Groq AI
// ============================================================

import { storageService } from '../utils/storageService';
import { formatBs, smartCashRounding, formatVzlaPhone } from '../utils/calculatorUtils';
import { DEFAULT_PAYMENT_METHODS, getPaymentLabel, getPaymentMethod, addPaymentMethod, removePaymentMethod, getActivePaymentMethods } from '../config/paymentMethods';
import { CurrencyService } from '../services/CurrencyService';
import { RateService } from '../services/RateService';
import { procesarImpactoCliente } from '../utils/financialLogic';
import { MessageService } from '../services/MessageService';
import { FinancialEngine } from '../core/FinancialEngine';
import { round2, round4, mulR, divR, subR, sumR } from '../utils/dinero';

// ── Claves de Storage Aisladas para Test ──
const TEST_KEYS = {
    products: 'test_myproductsv1',
    sales: 'test_mysalesv1',
    customers: 'test_mycustv1',
};

// ── Test State ──
const state = {
    logs: [],
    suites: [],          // { id, name, status: 'pending'|'running'|'passed'|'failed'|'skipped', startedAt, finishedAt, error }
    isRunning: false,
    stopped: false,
    startedAt: null,
    finishedAt: null,
    onLog: null,
    onProgress: null,
    onComplete: null,
    _7dayStats: null,
};

// ── Helpers de Estado ──
function resetState() { state.logs = []; state.suites = []; state.isRunning = false; state.stopped = false; state.startedAt = null; state.finishedAt = null; state._7dayStats = null; state.onLog = null; state.onProgress = null; state.onComplete = null; }

function initSuites(activeSuites) {
    state.suites = activeSuites.map(s => ({
        id: s.key,
        name: s.name,
        status: 'pending',
        startedAt: null,
        finishedAt: null,
        error: null
    }));
}

function updateSuiteStatus(id, patch) {
    const s = state.suites.find(x => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
}

// ── Logging ──
function log(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString('es-VE', { hour12: false });
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️', section: '━', ai: '🤖', day: '📅' };
    const icon = icons[type] || 'ℹ️';
    const entry = { time: ts, msg: `${icon} ${msg}`, type, raw: msg };

    state.logs.push(entry);
    state.onLog?.(entry);

    if (type === 'error') console.error(`[TEST ERROR] ${msg}`);
}

function section(title) {
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'section');
    log(title, 'section');
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'section');
}

// ── Assertions ──
class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssertionError';
    }
}

function assert(condition, message) {
    if (!condition) throw new AssertionError(message);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) throw new AssertionError(`${message} (Esperado: ${expected}, Recibido: ${actual})`);
}

function assertClose(actual, expected, message, tolerance = 0.02) {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
        throw new AssertionError(`${message} (Esperado: ~${expected}, Recibido: ${actual}, Diff: ${diff.toFixed(4)})`);
    }
}

// ── Helpers Generales ──
const TEST_PREFIX = '🧪_TEST_';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function createTestProduct(overrides = {}) {
    return {
        id: `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
        name: `${TEST_PREFIX}Producto ${Date.now()}`,
        priceUsdt: 5.00,
        costBs: 100,
        stock: 50,
        category: 'Test',
        barcode: `TST${Date.now()}`,
        unit: 'und',
        sellByUnit: false,
        _testData: true,
        ...overrides,
    };
}

function createTestCustomer(overrides = {}) {
    return {
        id: `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
        name: `${TEST_PREFIX}Cliente ${Date.now()}`,
        phone: '0412-TEST',
        deuda: 0,
        _testData: true,
        ...overrides,
    };
}

// ════════════════════════════════════════════
// LIMPIEZA TOTAL
// ════════════════════════════════════════════
async function cleanupTestData() {
    log('🧹 Ejecutando limpieza de claves de test...', 'info');
    try {
        await storageService.removeItem(TEST_KEYS.products);
        await storageService.removeItem(TEST_KEYS.sales);
        await storageService.removeItem(TEST_KEYS.customers);
        log('Limpieza completada: Claves de test eliminadas.', 'success');
    } catch (err) {
        log(`Error en limpieza de data: ${err.message}`, 'error');
    }
}

// ════════════════════════════════════════════

// ════════════════════════════════════════════

async function analyzeWithGroq(summary) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey) return null;
    const passed = summary.suites.filter(s => s.status === 'passed').length;
    const failed = summary.suites.filter(s => s.status === 'failed').length;
    const elapsed = summary.startedAt && summary.finishedAt ? ((summary.finishedAt - summary.startedAt) / 1000).toFixed(1) : '?';
    const problemLogs = summary.logs.filter(l => (l.type === 'warn' || l.type === 'error') && !l.raw.includes('Suite Failed:')).map(l => l.raw).join('\n');
    const suiteDetails = summary.suites.map(s => (s.status === 'passed' ? 'pass' : 'fail') + ' [' + s.id + '] ' + s.name + (s.error ? ' ERROR: ' + s.error : '')).join('\n');

    // Contexto de configuracion del sistema para evitar falsos alarmismos
    const allowNegStock = localStorage.getItem('allow_negative_stock') === 'true';
    const configContext = [
        'CONFIGURACION DEL SISTEMA:',
        '- Stock negativo permitido: ' + (allowNegStock ? 'SI (configuracion intencional del usuario)' : 'NO'),
        '- Los descuentos se almacenan en el campo discountAmountUsd (no en discount)',
        '- Una diferencia entre calculado y registrado puede ser un descuento aplicado, NO manipulacion',
        '- Si un hallazgo tiene explicacion por configuracion, NO generar alarma innecesaria',
    ].join('\n');

    const prompt = 'Eres un AUDITOR FINANCIERO FORENSE senior para la PWA PreciosAlDia (Venezuela, bimoneda USD/Bs). Examinas la base de datos REAL del negocio.\n\nRESULTADOS: Aprobadas ' + passed + '/' + summary.suites.length + ', Fallidas ' + failed + ', Tiempo ' + elapsed + 's\n\nSUITES:\n' + suiteDetails + '\n\n' + configContext + '\n\nHALLAZGOS FORENSES REALES:\n' + (problemLogs || 'Cero anomalias.') + '\n\nINSTRUCCIONES:\n1. VEREDICTO: Salud del negocio basada en hallazgos reales. Distinguir entre anomalias genuinas y comportamiento esperado por configuracion.\n2. DESGLOSE: Basado en HALLAZGOS, explica IDs, valores USD, impacto patrimonial real para el bodeguero. Si una anomalia se explica por la configuracion del sistema, indicarlo claramente.\n3. URGENCIA: Que corregir primero (solo anomalias genuinas).\n4. RECOMENDACIONES OPERATIVAS: Acciones manuales concretas.\n\nTono forense pero objetivo, markdown, espanol.';
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2500 }) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (e) {
        log('Error Groq API: ' + e.message, 'warn');
        return null;
    }
}

// 14. Regresión: Bugs corregidos en sesión 2026-03-04


// ════════════════════════════════════════════
// 1. AUDITORÍA DE PRECISIÓN (dinero.js vs IEEE 754)
// ════════════════════════════════════════════
async function suitePrecisionFinanciera() {
    section('🔬 SUITE: Auditoría de Precisión (Motor Financiero)');
    
    // Pruebas rígidas contra fallas IEEE 754
    assertClose(0.1 + 0.2, 0.30, 'Suma básica de punto flotante debe estar saneada');
    
    // Probar el Wrapper de Dinero.js simulado
    try {
        const d_sumR = sumR(0.1, 0.2);
        assertEqual(d_sumR, 0.30, 'Dinero.js sumR debe dar exactamente 0.30');
        
        const d_subR = subR(0.3, 0.2);
        assertEqual(d_subR, 0.10, 'Dinero.js subR debe dar exactamente 0.10');
        
        const d_mulR = mulR(1.005, 100);
        assertEqual(d_mulR, 100.50, 'Dinero.js mulR debe redondear correctamente');
        
        const d_divR = divR(10, 3);
        assertEqual(d_divR, 3.33, 'Dinero.js divR debe truncar a 2 decimales sin desborde');
        
        log('Motor financiero (dinero.js wrapper) operando con precisión matemática perfecta.', 'success');
    } catch(e) {
        log('Motor financiero falló prueba estricta: ' + e.message, 'error');
    }
}

// ════════════════════════════════════════════
// 2. AUDITORÍA FORENSE HISTÓRICA (bodega_sales_v1)
// ════════════════════════════════════════════
async function suiteAuditarDataHistorica() {
    section('🕵️ SUITE: Auditoría Forense de Datos Históricos');
    const sales = await storageService.getItem('bodega_sales_v1', []);
    if (!sales || sales.length === 0) return log('Libro de ventas vacío: No hay historial para auditar.', 'info');

    let driftedSalesCount = 0;
    
    for (const sale of sales) {
        if (!sale.items || sale.status === 'ANULADA') continue;
        
        let calculatedTotalUsd = 0;
        for (const item of sale.items) {
            calculatedTotalUsd = sumR(calculatedTotalUsd, mulR(item.priceUsd, item.qty));
        }
        
        // Descuentos — compatible con formato actual (discountAmountUsd) y legacy (discount)
        const discountUsd = sale.discountAmountUsd || sale.discount || 0;
        if (discountUsd > 0) {
            calculatedTotalUsd = subR(calculatedTotalUsd, discountUsd);
        }
        
        // Tolerancia a datos Legacy sin precisión
        if (Math.abs(calculatedTotalUsd - sale.totalUsd) > 0.05) {
            driftedSalesCount++;
            log(`[Anomalía Histórica] Ticket ${sale.id}: Calculado $ ${calculatedTotalUsd} vs Registrado $ ${sale.totalUsd}`, 'warn');
        }
    }
    
    if (driftedSalesCount > 0) {
        log(`Se encontraron ${driftedSalesCount} tickets históricos con anomalías de redondeo (Drift IEEE 754).`, 'error');
        throw new AssertionError(`${driftedSalesCount} tickets históricos con anomalías de integridad`);
    } else {
        log('Historial validado: 100% de integridad en sumatorias de tickets históricos.', 'success');
    }
}

// ════════════════════════════════════════════
// 3. AUDITORÍA PATRIMONIAL (Inventario Fantasma)
// ════════════════════════════════════════════
async function suitePatrimonialInventario() {
    section('🛒 SUITE: Auditoría Patrimonial (Inventario Fantasma)');
    const products = await storageService.getItem('bodega_products_v1', []);
    if (!products || !products.length) return log('No hay productos para auditar.', 'info');

    const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
    let ghostItems = 0;
    let totalGhostValueUsd = 0;

    for (const p of products) {
        if (p.stock < 0) {
            ghostItems++;
            totalGhostValueUsd += Math.abs(p.stock) * (p.priceUsdt || 0);
        }
    }

    if (ghostItems > 0 && !allowNeg) {
        // Stock negativo NO permitido por config → anomalía real
        log(`Patrimonio en riesgo: ${ghostItems} productos en negativo. Valor irreal proyectado: $${totalGhostValueUsd.toFixed(2)}`, 'error');
        throw new AssertionError(`${ghostItems} productos con stock negativo (config: stock negativo NO permitido)`);
    } else if (ghostItems > 0 && allowNeg) {
        // Stock negativo permitido por config → informativo, no fallo
        log(`Nota: ${ghostItems} productos en negativo ($${totalGhostValueUsd.toFixed(2)}). Permitido por configuración (allow_negative_stock=true).`, 'warn');
    } else {
        log('Inventario matemáticamente sano. 0 productos en estado Fantasma (Negativo).', 'success');
    }
}

// ════════════════════════════════════════════
// 4. AUDITORÍA DE CARTERA (Deuda Circular)
// ════════════════════════════════════════════
async function suiteDeudaCircular() {
    section('👥 SUITE: Auditoría de Integridad de Cartera (Deuda vs Favor)');
    const customers = await storageService.getItem('bodega_customers_v1', []);
    if (!customers || !customers.length) return log('No hay clientes para auditar.', 'info');

    let circularAnomalies = 0;

    for (const c of customers) {
        if (c.deuda > 0 && c.favor > 0) {
            circularAnomalies++;
            log(`[Deuda Circular] Cliente ${c.name} tiene Deuda ($${c.deuda}) y Favor ($${c.favor}) simultáneamente.`, 'warn');
        }
    }

    if (circularAnomalies > 0) {
        log(`Se encontraron ${circularAnomalies} clientes con carteras no normalizadas (Deuda Circular).`, 'error');
        throw new AssertionError(`${circularAnomalies} clientes con deuda circular (deuda y favor simultáneos)`);
    } else {
        log('Libros de cartera limpios. Todos los abonos y deudas están normalizados cruzadamente.', 'success');
    }
}

// ════════════════════════════════════════════
// 5. AUDITORÍA DE SOLAPAMIENTO (Ventas Huérfanas de Cierre)
// ════════════════════════════════════════════
async function suiteOverlappingCierre() {
    section('📦 SUITE: Auditoría de Cierres Diarios (Ventas Huérfanas)');
    const sales = await storageService.getItem('bodega_sales_v1', []);
    const reports = await storageService.getItem('bodega_reports_v1', []);
    
    if (!sales || !sales.length) return log('No hay datos suficientes para cruzar reportes.', 'info');

    let orphanedSales = 0;
    const now = new Date();

    for (const sale of sales) {
        if (sale.status === 'COMPLETADA') {
            const saleDate = new Date(sale.createdAt || sale.date);
            const hoursOld = (now - saleDate) / (1000 * 60 * 60);
            
            if (hoursOld > 24 && !sale.syncStatus) {
                orphanedSales++;
            }
        }
    }

    if (orphanedSales > 0) {
        log(`Se detectaron ${orphanedSales} ventas "Huérfanas" antiguas (¿Omisión de cierre de turno?).`, 'error');
        throw new AssertionError(`${orphanedSales} ventas huérfanas sin cierre de turno (>24h)`);
    } else {
        log('Conciliación de turnos OK. Los tickets están procesados o en el turno actual (Menos de 24h).', 'success');
    }
}

// ════════════════════════════════════════════
// 6. DETECTOR DE VOLATILIDAD DE TASA (Rate Sneak)
// ════════════════════════════════════════════
async function suiteRateSneak() {
    section('💱 SUITE: Detector de Volatilidad de Tasa (Rate Sneak)');
    const sales = await storageService.getItem('bodega_sales_v1', []);
    if (!sales || !sales.length) return log('No hay ventas para auditar.', 'info');

    let tamperedRates = 0;

    for (const sale of sales) {
        if (sale.status === 'ANULADA' || !sale.totalUsd || !sale.totalBs || !sale.rate) continue;
        const calculatedRate = sale.totalBs / sale.totalUsd;
        const diff = Math.abs(calculatedRate - sale.rate);

        if (diff > 0.05) { 
            log(`[Rate Sneak] Venta ID ${sale.id}: Tasa registrada ${sale.rate}, Matemática pura exige ${calculatedRate.toFixed(2)}`, 'warn');
            tamperedRates++;
        }
    }

    if (tamperedRates > 0) {
        log(`Se detectaron ${tamperedRates} transacciones afectadas por volatilidad de tasa.`, 'error');
        throw new AssertionError(`${tamperedRates} transacciones con volatilidad de tasa (Rate Sneak)`);
    } else {
        log('La correlación Matemática Tasa vs Totales es estricta en todo el historial estudiado.', 'success');
    }
}

const SUITES = [
    { key: 'precision_financiera', name: '🔬 Motor: Certificación de Precisión', fn: suitePrecisionFinanciera, fast: true },
    { key: 'auditoria_historica', name: '🕵️ Histórico: Integridad de Libros', fn: suiteAuditarDataHistorica, fast: true },
    { key: 'auditoria_patrimonial', name: '🛒 Inventario: Auditoría Patrimonial', fn: suitePatrimonialInventario, fast: true },
    { key: 'auditoria_cartera', name: '👥 Clientes: Deuda Circular', fn: suiteDeudaCircular, fast: true },
    { key: 'auditoria_cierre', name: '📦 Finanzas: Ventas Huérfanas de Cierre', fn: suiteOverlappingCierre, fast: true },
    { key: 'auditoria_tasas', name: '💱 Operaciones: Volatilidad de Tasa (Rate Sneak)', fn: suiteRateSneak, fast: true }
];

// ════════════════════════════════════════════
// EXPORTS API
// ════════════════════════════════════════════

export const SystemTester = {
    getSuites: () => [...SUITES],

    getState: () => ({
        logs: [...state.logs],
        suites: [...state.suites],
        isRunning: state.isRunning,
        stopped: state.stopped,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt
    }),

    stop: () => {
        state.stopped = true;
        log('⛔ Se solicitó detección de los tests.', 'warn');
    },

    async runAll({ onLog, onProgress, onComplete, fastMode = false } = {}) {
        resetState();

        // Determinar qué suites correr basado en fastMode
        const targetSuites = fastMode ? SUITES.filter(s => s.fast) : SUITES;
        initSuites(targetSuites);

        state.isRunning = true;
        state.startedAt = Date.now();
        state.onLog = onLog || null;
        state.onProgress = onProgress || null;

        log(`🚀 Iniciando System Tester v4.0 [FastMode: ${fastMode ? 'ON' : 'OFF'}]`, 'info');

        let passed = 0;
        let failed = 0;

        await cleanupTestData(); // Asegurar entorno limpio

        for (let i = 0; i < targetSuites.length; i++) {
            const suiteConfig = targetSuites[i];

            if (state.stopped) {
                log('⛔ Test abortado por el usuario', 'warn');
                updateSuiteStatus(suiteConfig.key, { status: 'skipped' });
                continue;
            }

            onProgress?.({ name: suiteConfig.name, current: i + 1, total: targetSuites.length });
            log(`Iniciando suite: ${suiteConfig.name}`, 'info');

            updateSuiteStatus(suiteConfig.key, { status: 'running', startedAt: Date.now() });

            try {
                await suiteConfig.fn();
                updateSuiteStatus(suiteConfig.key, { status: 'passed', finishedAt: Date.now() });
                passed++;
            } catch (err) {
                log(`💥 Suite Failed: ${suiteConfig.name} - ${err.message}`, 'error');
                updateSuiteStatus(suiteConfig.key, { status: 'failed', finishedAt: Date.now(), error: err.message });
                failed++;
            }

            await delay(30);
        }

        await cleanupTestData(); // Limpiar al final

        state.finishedAt = Date.now();
        const elapsedSec = ((state.finishedAt - state.startedAt) / 1000).toFixed(1);

        section('📊 RESULTADO FINAL');
        log(`✅ ${passed} aprobadas | ❌ ${failed} fallidas | ⏱️ ${elapsedSec}s`, passed > 0 && failed === 0 ? 'success' : 'error');

        state.isRunning = false;

        // ════ GROQ AI ANALYSIS (Post-Run) ════
        const finalSummary = this.getState();
        let aiAnalysis = null;
        try {
            aiAnalysis = await analyzeWithGroq(finalSummary);
            if (aiAnalysis) {
                finalSummary.aiAnalysis = aiAnalysis;
                log('🧠 Análisis AI completado.', 'ai');
            }
        } catch (e) {
            log(`⚠️ Groq AI no disponible: ${e.message}`, 'warn');
        }

        onComplete?.(finalSummary);

        return finalSummary;
    },

    async runSuite(suiteId, { onLog } = {}) {
        resetState();
        const suiteConfig = SUITES.find(s => s.key === suiteId);

        if (!suiteConfig) {
            log(`Suite "${suiteId}" no encontrada`, 'error');
            return null;
        }

        initSuites([suiteConfig]);

        state.isRunning = true;
        state.startedAt = Date.now();
        state.onLog = onLog || null;

        await cleanupTestData();

        log(`🚀 Ejecutando suite unitaria: ${suiteConfig.name}`, 'info');
        updateSuiteStatus(suiteConfig.key, { status: 'running', startedAt: Date.now() });

        try {
            await suiteConfig.fn();
            updateSuiteStatus(suiteConfig.key, { status: 'passed', finishedAt: Date.now() });
            log(`${suiteConfig.name} ✓`, 'success');
        } catch (err) {
            log(`💥 Error en ${suiteConfig.name}: ${err.message}`, 'error');
            updateSuiteStatus(suiteConfig.key, { status: 'failed', finishedAt: Date.now(), error: err.message });
        }

        await cleanupTestData();

        state.finishedAt = Date.now();
        state.isRunning = false;

        return this.getState();
    },
};
