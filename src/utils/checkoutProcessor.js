import { storageService } from './storageService';
import { procesarImpactoCliente } from './financialLogic';
import { logEvent } from '../services/auditService';
import { useAuthStore } from '../hooks/store/authStore';
import { round2, subR, sumR } from './dinero';
import { supabaseCloud as supabase } from '../config/supabaseCloud';
import { offlineQueueService } from '../services/offlineQueueService';
import { capitalizeName } from './calculatorUtils';
import { broadcastNewSale } from './salesSyncService';

const SALES_KEY = 'bodega_sales_v1';
const EPSILON = 0.01;

// UUID v4 regex - productos sin formato UUID no se envian al RPC de Supabase
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id) => UUID_REGEX.test(id);

export async function processSaleTransaction({
    cart,
    cartTotalUsd,
    cartTotalBs,
    cartSubtotalUsd,
    payments,
    changeBreakdown,
    selectedCustomerId,
    customers,
    products,
    effectiveRate,
    tasaCop,
    copEnabled,
    discountData,
    useAutoRate,
    meseroId = null,
    meseroNombre = null,
    tableName = null,
    splitMeta = null
}) {
    if (cart.length === 0) return { success: false, error: 'Carrito vacío' };

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const totalPaidUsd = sumR(payments.map(p => p.amountUsd));
    const remainingUsd = round2(Math.max(0, subR(cartTotalUsd, totalPaidUsd)));
    const changeUsd = round2(Math.max(0, subR(totalPaidUsd, cartTotalUsd)));

    if (!selectedCustomer && remainingUsd > EPSILON) {
        return { success: false, error: 'Se requiere cliente para ventas fiadas' };
    }

    if (isNaN(cartTotalUsd) || cartTotalUsd < 0 || isNaN(totalPaidUsd) || totalPaidUsd < 0) {
        return { success: false, error: 'Integridad matemática comprometida' };
    }

    if (cartTotalUsd <= EPSILON) {
        return { success: false, error: 'No se pueden generar ventas de $0.00' };
    }

    // Validate saldo a favor BEFORE persisting anything
    if (selectedCustomerId) {
        const saldoFavorUsed = payments.filter(p => p.methodId === 'saldo_favor').reduce((sum, p) => sum + p.amountUsd, 0);
        if (saldoFavorUsed > (selectedCustomer?.favor || 0) + EPSILON) {
            return { success: false, error: 'Saldo a favor insuficiente' };
        }
    }

    const fiadoAmountUsd = remainingUsd > EPSILON ? remainingUsd : 0;
    
    // Preparar el Payload para la validación centralizada
    // Se envía currency y methodLabel para que el RPC pueda mapear cuentas contables
    // correctamente sin depender del methodId hardcodeado.
    //
    // NOTA: Solo se incluyen productos con IDs en formato UUID.
    // Productos con IDs heredados (ej. "p-snack-2") se procesan solo localmente.
    const cartForRpc = cart.filter(i => isValidUUID(i._originalId || i.id));
    const hasRpcCompatibleItems = cartForRpc.length > 0;

    // Calcular el total EXACTO desde los items del carrito que se envían al RPC.
    // El servidor recalcula sum(qty * priceUsd) y lo compara con sum(pagos) + fiado.
    // Si usamos cartTotalUsd (redondeado) puede diferir del cálculo del servidor.
    const rpcCartItems = cartForRpc.map(i => ({
        id: i._originalId || i.id,
        qty: i.qty,
        priceUsd: i.priceUsd,
        isCombo: i.isCombo || false,
        linkedProductId: i.linkedProductId || null,
        linkedQty: i.linkedQty || 1,
        comboItems: i.comboItems || null
    }));
    const rpcTotal = round2(rpcCartItems.reduce((s, ci) => s + ci.qty * ci.priceUsd, 0));

    // Ajustar fiado proporcionalmente si el total RPC difiere del original
    const rpcFiadoUsd = rpcTotal !== cartTotalUsd && fiadoAmountUsd > 0
        ? round2(Math.max(0, rpcTotal - round2(cartTotalUsd - fiadoAmountUsd)))
        : fiadoAmountUsd;

    // Ajustar pagos para el RPC: descontar el vuelto para que Débito == Crédito
    // El RPC espera que sum(pagos) + fiado == sum(qty*priceUsd) exactamente.
    let rpcPayments = payments.map(p => ({
      methodId: p.methodId,
      amountUsd: p.amountUsd,
      currency: p.currency || 'USD',
      methodLabel: p.methodLabel || p.methodId
    }));

    const rpcPayTotal = rpcPayments.reduce((s, p) => s + (p.amountUsd || 0), 0);
    const rpcExcess = round2(rpcPayTotal + rpcFiadoUsd - rpcTotal);
    if (rpcExcess > EPSILON && rpcPayments.length > 0) {
      let remaining = rpcExcess;
      for (let i = rpcPayments.length - 1; i >= 0 && remaining > EPSILON; i--) {
        const reduction = Math.min(remaining, rpcPayments[i].amountUsd);
        rpcPayments[i] = { ...rpcPayments[i], amountUsd: round2(rpcPayments[i].amountUsd - reduction) };
        remaining = round2(remaining - reduction);
      }
      rpcPayments = rpcPayments.filter(p => p.amountUsd > EPSILON);
    }

    // Forzar que el último pago absorba cualquier diferencia residual de redondeo
    const finalPaySum = round2(rpcPayments.reduce((s, p) => s + p.amountUsd, 0));
    const residual = round2(rpcTotal - finalPaySum - rpcFiadoUsd);
    if (Math.abs(residual) > 0.001 && rpcPayments.length > 0) {
      rpcPayments[rpcPayments.length - 1] = {
        ...rpcPayments[rpcPayments.length - 1],
        amountUsd: round2(rpcPayments[rpcPayments.length - 1].amountUsd + residual)
      };
    }

    const rpcPayload = {
      total: rpcTotal,
      cart: rpcCartItems,
      payments: rpcPayments,
      fiadoUsd: rpcFiadoUsd
    };

    let saleMode = 'online';
    let finalSaleId = null;

    // Idempotency key: use a stable UUID so retries/pending verifications
    // don't create duplicate sales on the server.
    const idempotencyKey = crypto.randomUUID();
    rpcPayload.idempotency_key = idempotencyKey;

    // Si ningún producto del carrito tiene UUID válido, ir directo a offline.
    // Esto previene el error 400 de Supabase cuando se venden productos con IDs heredados.
    if (!hasRpcCompatibleItems) {
        console.log('[Checkout] Carrito sin UUIDs válidos — usando MODO OFFLINE directamente.');
        saleMode = 'offline';
    } else if (navigator.onLine) {
       try {
         // Intentar RPC Transaccional Atómica
         const rpcPromise = supabase.rpc('process_checkout', { payload: rpcPayload });
         const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000));

         const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
         if (error) throw error;

         finalSaleId = data.sale_id;
       } catch (err) {
         if (err.message === 'TIMEOUT') {
           // Timeout does NOT mean the RPC failed — it may still succeed server-side.
           // Add to pending verification queue so we can reconcile later,
           // rather than assuming full offline mode (which could cause duplicates).
           console.warn('[Checkout] RPC timeout — agregando a cola de verificación pendiente', err);
           saleMode = 'pending_verification';
           await offlineQueueService.addSaleToQueue({ ...rpcPayload, _pendingVerification: true });
         } else {
           console.warn('[Checkout] Fallo en RPC Supabase, cambiando a MODO OFFLINE', err);
           saleMode = 'offline';
         }
       }
    } else {
       saleMode = 'offline';
    }

    if (saleMode === 'offline') {
       // Delegar a la cola de emergencia
       await offlineQueueService.addSaleToQueue(rpcPayload);
    }

    // ── GESTIÓN DE CACHÉ LOCAL (Para no bloquear al usuario) ──
    const currentUser = useAuthStore.getState().currentUser;
    const sale = {
        id: finalSaleId || crypto.randomUUID(),
        tipo: fiadoAmountUsd > 0 ? 'VENTA_FIADA' : 'VENTA',
        status: saleMode === 'online' ? 'COMPLETADA' : (saleMode === 'pending_verification' ? 'PENDIENTE_VERIFICACION' : 'PENDIENTE_SYNC'),
        vendedorId: currentUser?.id || null,
        vendedorNombre: capitalizeName(currentUser?.nombre || currentUser?.name || 'Sistema'),
        vendedorRol: currentUser?.rol || currentUser?.role || null,
        meseroId: meseroId || null,
        meseroNombre: capitalizeName(meseroNombre) || null,
        tableName: tableName || null,
        items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, priceUsd: i.priceUsd, costBs: i.costBs || 0, costUsd: i.costUsd || 0, isWeight: i.isWeight })),
        cartSubtotalUsd: cartSubtotalUsd,
        discountType: discountData?.type || null,
        discountValue: discountData?.value || 0,
        discountAmountUsd: discountData?.amountUsd || 0,
        totalUsd: cartTotalUsd,
        totalBs: cartTotalBs,
        totalCop: copEnabled && tasaCop > 0 ? cartTotalUsd * tasaCop : 0,
        payments,
        rate: effectiveRate,
        tasaCop: copEnabled ? tasaCop : 0,
        copEnabled: copEnabled,
        rateSource: useAutoRate ? 'BCV Auto' : 'Manual',
        timestamp: new Date().toISOString(),
        changeUsd: fiadoAmountUsd > 0 ? 0 : (changeBreakdown?.changeUsdGiven || 0),
        changeBs: fiadoAmountUsd > 0 ? 0 : (changeBreakdown?.changeBsGiven || 0),
        customerId: selectedCustomerId || null,
        customerName: selectedCustomer ? selectedCustomer.name : 'Consumidor Final',
        customerDocument: selectedCustomer?.documentId || null,
        customerPhone: selectedCustomer?.phone || null,
        fiadoUsd: fiadoAmountUsd,
        splitMeta: splitMeta || null
    };

    const existingSales = await storageService.getItem(SALES_KEY, []);
    // Correlativo secuencial: continúa desde el mayor número existente
    const numericNums = existingSales
        .map(s => Number(s.saleNumber))
        .filter(n => Number.isInteger(n) && n > 0 && n < 90000);
    const saleNumber = (numericNums.length > 0 ? Math.max(...numericNums) : 0) + 1;
    const finalPersistedSale = Object.freeze({ ...sale, saleNumber });

    await storageService.setItem(SALES_KEY, [finalPersistedSale, ...existingSales]);

    // Sincronizar venta a otros dispositivos (Broadcast P2P + persist individual en DB)
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) {
            broadcastNewSale({ ...finalPersistedSale }, session.user.id).catch(() => {});
        }
    }).catch(() => {});

    // Audit log
    const tipo = fiadoAmountUsd > 0 ? 'VENTA_FIADO' : 'VENTA_COMPLETADA';
    logEvent('VENTA', tipo, `Venta #${saleNumber} [${saleMode.toUpperCase()}] - $${cartTotalUsd.toFixed(2)} - ${cart.length} items - ${selectedCustomer?.name || 'Consumidor Final'}`, currentUser, { saleId: finalPersistedSale.id, total: cartTotalUsd, items: cart.length });

    // ── CLIENT-SIDE STOCK DEDUCTION ──
    // Stock is always deducted client-side regardless of sale mode.
    // The RPC `process_checkout` does NOT modify the products table,
    // so this is the authoritative stock update. Changes are saved to
    // localforage and broadcast to other devices via Supabase Broadcast.
    let updatedProducts = products;

    {
    // Calculate total deductions per product ID
    const deductions = {};
    cart.forEach(item => {
        let deduction = 0;
        if (item.isWeight) deduction = item.qty;
        else if (item._mode === 'unit') deduction = (item.qty / (item._unitsPerPackage || 1));
        else deduction = item.qty;

        if (item.isCombo) {
            if (item.comboItems && item.comboItems.length > 0) {
                // Multi-product combo
                item.comboItems.forEach(ci => {
                    const ciDeduction = deduction * (ci.qty || 1);
                    deductions[ci.productId] = (deductions[ci.productId] || 0) + ciDeduction;
                });
            } else if (item.linkedProductId) {
                // Legacy single-product combo
                const linkedDeduction = deduction * (item.linkedQty || 1);
                deductions[item.linkedProductId] = (deductions[item.linkedProductId] || 0) + linkedDeduction;
            }
            // Combos don't deduct their own stock
        } else {
            const id = item._originalId || item.id;
            deductions[id] = (deductions[id] || 0) + deduction;
        }
    });

    updatedProducts = products.map(p => {
        if (deductions[p.id]) {
            const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
            const newStock = (p.stock ?? 0) - deductions[p.id];
            return { ...p, stock: allowNeg ? newStock : Math.max(0, newStock) };
        }
        return p;
    });

    await storageService.setItem('bodega_products_v1', updatedProducts);
    }

    let updatedCustomer = null;
    let updatedCustomers = customers;

    if (selectedCustomer) {
        const amount_favor_used = payments.filter(p => p.methodId === 'saldo_favor').reduce((sum, p) => sum + p.amountUsd, 0);

        const transaccionOpts = {
            usaSaldoFavor: amount_favor_used,
            esCredito: fiadoAmountUsd > EPSILON,
            deudaGenerada: fiadoAmountUsd,
            vueltoParaMonedero: 0
        };

        updatedCustomer = procesarImpactoCliente(selectedCustomer, transaccionOpts);
        updatedCustomers = customers.map(c => c.id === selectedCustomer.id ? updatedCustomer : c);

        await storageService.setItem('bodega_customers_v1', updatedCustomers);
    }

    return {
        success: true,
        sale: finalPersistedSale,
        updatedProducts,
        updatedCustomers,
        syncMode: saleMode
    };
}
