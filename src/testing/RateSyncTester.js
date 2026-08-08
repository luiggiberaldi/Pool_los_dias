// ============================================================
// 🔀 RATE SYNC TESTER v1.0 — Deterministic Rate Consistency Tester
// ============================================================
// Validates currency rate consistency between Table Billing Engine
// and Cashier Checkout across 6 deterministic test suites.
// ============================================================

import { round2 } from '../utils/dinero';
import {
    calculateTimeCostBsBreakdown,
    calculateTimeCostBs,
    calculateConsumptionBs,
    calculateGrandTotalBs,
} from '../utils/tableBillingEngine';

export function runRateSyncTests() {
    const results = [];
    
    function test(name, fn) {
        try {
            fn();
            results.push({ name, pass: true });
        } catch (err) {
            results.push({ name, pass: false, error: err.message });
        }
    }

    function assertEqual(actual, expected, msg) {
        const diff = Math.abs(actual - expected);
        if (diff > 0.01) {
            throw new Error(`${msg}: Esperado ${expected}, pero se obtuvo ${actual}`);
        }
    }

    // Suite 1: calculateConsumptionBs con tasa manual (800) vs unit_price_bs congelado (752.55)
    test("Suite 1: Consumo normal usa tasa activa manual (800) e ignora unit_price_bs estático", () => {
        const items = [{ product_id: 'P1', unit_price_usd: 3.92, unit_price_bs: 2950, qty: 1 }];
        const tasaManual = 800;
        const totalBs = calculateConsumptionBs(items, tasaManual, []);
        assertEqual(totalBs, 3136.00, "El consumo de $3.92 a tasa 800 debe dar Bs 3136.00");
    });

    // Suite 2: calculateConsumptionBs preserva precioBs independiente de combos
    test("Suite 2: Preserva priceBs explícito en combos", () => {
        const items = [{ product_id: 'COMBO1', unit_price_usd: 2.00, unit_price_bs: null, qty: 1 }];
        const products = [{ id: 'COMBO1', isCombo: true, priceBs: 1500 }];
        const tasaManual = 800;
        const totalBs = calculateConsumptionBs(items, tasaManual, products);
        assertEqual(totalBs, 1500.00, "El combo debe usar su priceBs fijo de 1500 Bs");
    });

    // Suite 3: calculateTimeCostBsBreakdown piñas con tasa manual
    test("Suite 3: Desglose de piñas calcula con tasa activa manual", () => {
        const config = { pricePina: 2.00, pricePinaBs: 0 };
        const tasaManual = 800;
        const res = calculateTimeCostBsBreakdown(4.00, 0, config, tasaManual);
        assertEqual(res.pinaCostBs, 3200.00, "Piñas de $4.00 a tasa 800 deben ser Bs 3200.00");
    });

    // Suite 4: calculateTimeCostBs modo PINA usa tarifa de piña
    test("Suite 4: Modo PINA usa tarifa de piña correctamente", () => {
        const config = { pricePina: 2.00, pricePinaBs: 0, pricePerHour: 5.00, pricePerHourBs: 0 };
        const tasaManual = 800;
        const totalBs = calculateTimeCostBs(4.00, 'PINA', config, tasaManual);
        assertEqual(totalBs, 3200.00, "Modo PINA debe dar Bs 3200.00 para $4.00 de tiempo a 800 Bs/$");
    });

    // Suite 5: Paridad Mesa -> Cobro
    test("Suite 5: Paridad exacta entre Mesa ($3.92) y Checkout a 800 Bs/$", () => {
        const items = [
            { product_id: 'P1', unit_price_usd: 1.32, unit_price_bs: 993.36, qty: 1 },
            { product_id: 'P2', unit_price_usd: 2.60, unit_price_bs: 1956.64, qty: 1 }
        ];
        const config = { pricePerHour: 0, pricePina: 0 };
        const tasaManual = 800;
        const cBs = calculateConsumptionBs(items, tasaManual, []);
        const totalMesaBs = calculateGrandTotalBs(0, 3.92, 'NORMAL', config, tasaManual, null, cBs);
        const checkoutTotalBs = round2(3.92 * tasaManual);
        assertEqual(totalMesaBs, checkoutTotalBs, "El total visual de mesa debe ser idéntico al total del Checkout (3136 Bs)");
    });

    // Suite 6: Regresión modo BCV auto
    test("Suite 6: Regresión en modo BCV automático (752.55 Bs/$)", () => {
        const items = [{ product_id: 'P1', unit_price_usd: 10.00, unit_price_bs: null, qty: 1 }];
        const tasaBcv = 752.55;
        const totalBs = calculateConsumptionBs(items, tasaBcv, []);
        assertEqual(totalBs, 7525.50, "$10.00 a tasa BCV 752.55 debe ser Bs 7525.50");
    });

    // Suite 7: Precio explícito en Bs para hora siempre se honra (caso del usuario: $3 = 2500 Bs)
    test("Suite 7: Precio explícito en Bs para hora se honra (no debe dar 2400 con tasa 800)", () => {
        // Escenario EXACTO del usuario: $3/hora con 2500 Bs configurado, tasa manual 800
        // Con el umbral incorrecto: 3 * 800 = 2400 Bs (INCORRECTO)
        // Con lógica correcta: 3 * (2500/3) = 2500 Bs (CORRECTO)
        const config = { pricePerHour: 3, pricePerHourBs: 2500, pricePina: 0.5, pricePinaBs: 500 };
        const tasaManual = 800;
        const res = calculateTimeCostBsBreakdown(0, 3.00, config, tasaManual);
        assertEqual(res.hourCostBs, 2500.00, "$3 de tiempo con config 2500 Bs/hora debe dar Bs 2500.00, no Bs 2400.00");
    });

    return results;
}
