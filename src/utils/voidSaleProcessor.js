import { storageService } from './storageService';
import { logEvent } from '../services/auditService';
import { useAuthStore } from '../hooks/store/useAuthStore';
import { round2 } from './dinero';

const SALES_KEY = 'bodega_sales_v1';
const CUSTOMERS_KEY = 'bodega_customers_v1';

/**
 * Handles the logic of voiding a transaction, reverting stock, and reverting customer balances.
 */
export async function processVoidSale(sale, currentSales, currentProducts) {
    if (!sale) throw new Error("Sale object is required to void.");

    // 1. Marcar venta como ANULADA
    const updatedSales = currentSales.map(s => {
        if (s.id === sale.id) return { ...s, status: 'ANULADA' };
        return s;
    });

    // 2. Revertir Stock
    let updatedProducts = [...currentProducts];
    if (sale.items && sale.items.length > 0) {
        updatedProducts = currentProducts.map(p => {
            const itemsInSale = sale.items.filter(i => (i._originalId || i.id) === p.id);
            if (itemsInSale.length > 0) {
                const totalToRestore = itemsInSale.reduce((sum, item) => {
                    if (item.isWeight) return sum + item.qty;
                    if (item._mode === 'unit') return sum + (item.qty / (item._unitsPerPackage || 1));
                    return sum + item.qty;
                }, 0);
                return { ...p, stock: round2((p.stock || 0) + totalToRestore) };
            }
            return p;
        });
    }

    // 3. Revertir Deuda Y Saldo a Favor del Cliente (por separado)
    const savedCustomers = await storageService.getItem(CUSTOMERS_KEY, []);
    let updatedCustomers = savedCustomers;

    if (sale.customerId) {
        // Monto que fue fiado (genera deuda) → revertir deuda
        const fiadoAmountUsd = sale.fiadoUsd || (sale.tipo === 'VENTA_FIADA' ? sale.totalUsd : 0) || 0;

        // Monto pagado con saldo a favor → restaurar favor
        const favorUsed = sale.payments
            ?.filter(p => p.methodId === 'saldo_favor')
            .reduce((sum, p) => sum + (p.amountUsd || 0), 0) || 0;

        if (fiadoAmountUsd > 0 || favorUsed > 0) {
            updatedCustomers = savedCustomers.map(c => {
                if (c.id !== sale.customerId) return c;

                let newDeuda = c.deuda || 0;
                let newFavor = c.favor || 0;

                // Revertir deuda (la venta fiada ya no existe)
                if (fiadoAmountUsd > 0) {
                    newDeuda = round2(Math.max(0, newDeuda - fiadoAmountUsd));
                }

                // Restaurar saldo a favor (el pago con favor se devuelve)
                if (favorUsed > 0) {
                    newFavor = round2(newFavor + favorUsed);
                }

                console.log(`[Anular] Cliente ${c.name}: deuda ${c.deuda}->${newDeuda}, favor ${c.favor}->${newFavor}`);
                return { ...c, deuda: newDeuda, favor: newFavor };
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
