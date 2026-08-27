import { storageService } from './storageService';
import { logEvent } from '../services/auditService';
import { useAuthStore } from '../hooks/store/authStore';
import { round2 } from './dinero';
import { revertCustomerImpact } from './financialLogic';

const SALES_KEY = 'bodega_sales_v1';
const CUSTOMERS_KEY = 'bodega_customers_v1';

/**
 * Handles the logic of voiding a transaction, reverting stock, and reverting customer balances.
 */
export async function processVoidSale(sale, currentSales, currentProducts) {
    if (!sale) throw new Error("Sale object is required to void.");
    // Defensa en profundidad: las ventas protegidas por cierre de caja no se anulan
    // (la UI ya oculta el botón, pero ningún caller debe poder saltarse el cerrojo).
    if (sale.cajaCerrada) throw new Error("No se puede anular: la venta está protegida por un cierre de caja.");

    // 1. Marcar venta como ANULADA
    const updatedSales = currentSales.map(s => {
        if (s.id === sale.id) return { ...s, status: 'ANULADA' };
        return s;
    });

    // 2. Revertir Stock (misma lógica que checkoutProcessor pero invertida)
    let updatedProducts = [...currentProducts];
    if (sale.items && sale.items.length > 0) {
        // Calcular restauraciones por product ID (igual que deductions en checkout)
        const restorations = {};
        sale.items.forEach(item => {
            let restoration = 0;
            if (item.isWeight) restoration = item.qty;
            else if (item._mode === 'unit') restoration = (item.qty / (item._unitsPerPackage || 1));
            else restoration = item.qty;

            if (item.isCombo) {
                if (item.comboItems && item.comboItems.length > 0) {
                    // Multi-product combo: restaurar sub-productos
                    item.comboItems.forEach(ci => {
                        const ciRestoration = restoration * (ci.qty || 1);
                        restorations[ci.productId] = (restorations[ci.productId] || 0) + ciRestoration;
                    });
                } else if (item.linkedProductId) {
                    // Legacy single-product combo
                    const linkedRestoration = restoration * (item.linkedQty || 1);
                    restorations[item.linkedProductId] = (restorations[item.linkedProductId] || 0) + linkedRestoration;
                }
                // Combos no restauran su propio stock
            } else {
                const id = item._originalId || item.id;
                restorations[id] = (restorations[id] || 0) + restoration;
            }
        });

        updatedProducts = currentProducts.map(p => {
            if (restorations[p.id]) {
                return { ...p, stock: round2((p.stock || 0) + restorations[p.id]) };
            }
            return p;
        });
    }

    // 3. Revertir Deuda Y Saldo a Favor del Cliente (por separado)
    // NOTA: checkout guarda `customerId`; las transacciones del módulo Clientes
    // (abonos COBRO_DEUDA y créditos manuales) guardan `clienteId`. Aceptar ambos.
    const voidCustomerId = sale.customerId || sale.clienteId;
    const savedCustomers = await storageService.getItem(CUSTOMERS_KEY, []);
    let updatedCustomers = savedCustomers;

    if (voidCustomerId) {
        // Monto que fue fiado (genera deuda) → revertir deuda
        const fiadoAmountUsd = sale.fiadoUsd || (sale.tipo === 'VENTA_FIADA' ? sale.totalUsd : 0) || 0;

        // Monto pagado con saldo a favor → restaurar favor
        const favorUsed = sale.payments
            ?.filter(p => p.methodId === 'saldo_favor')
            .reduce((sum, p) => sum + (p.amountUsd || 0), 0) || 0;

        // Abono de deuda anulado → restaurar la deuda que ese pago redujo.
        // El abono SIEMPRE sube el neto (favor - deuda) en totalUsd (deuda primero,
        // luego favor), así que su inversa exacta es restar totalUsd al neto actual.
        const isDebtPayment = sale.tipo === 'COBRO_DEUDA';
        const abonoUsd = isDebtPayment ? round2(sale.totalUsd || 0) : 0;

        if (fiadoAmountUsd > 0 || favorUsed > 0 || abonoUsd > 0) {
            updatedCustomers = savedCustomers.map(c => {
                if (c.id !== voidCustomerId) return c;
                const reverted = revertCustomerImpact(c, sale);
                console.log(`[Anular] Cliente ${c.name}: deuda ${c.deuda}->${reverted.deuda}, favor ${c.favor}->${reverted.favor}`);
                return { ...c, deuda: reverted.deuda, favor: reverted.favor };
            });
        }
    }

    // 4. Guardar todo
    await storageService.setItem(SALES_KEY, updatedSales);
    await storageService.setItem(CUSTOMERS_KEY, updatedCustomers);

    const user = useAuthStore.getState().usuarioActivo;
    logEvent('VENTA', 'VENTA_ANULADA', `Venta #${sale.saleNumber || '?'} anulada - $${sale.totalUsd?.toFixed(2)}`, user, { saleId: sale.id });

    return { updatedSales, updatedProducts, updatedCustomers };
}
