import { storageService } from './storageService';
import { procesarImpactoCliente } from './financialLogic';
import { logEvent } from '../services/auditService';
import { useAuthStore } from '../hooks/store/useAuthStore';
import { useAuthStore as useNewAuthStore } from '../hooks/store/authStore';
import { round2, subR, sumR } from './dinero';
import { supabaseCloud as supabase } from '../config/supabaseCloud';
import { offlineQueueService } from '../services/offlineQueueService';

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
    meseroNombre = null
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

    const fiadoAmountUsd = remainingUsd > EPSILON ? remainingUsd : 0;
    
    // Preparar el Payload para la validación centralizada
    // Se envía currency y methodLabel para que el RPC pueda mapear cuentas contables
    // correctamente sin depender del methodId hardcodeado.
    //
    // NOTA: Solo se incluyen productos con IDs en formato UUID.
    // Productos con IDs heredados (ej. "p-snack-2") se procesan solo localmente.
    const cartForRpc = cart.filter(i => isValidUUID(i._originalId || i.id));
    const hasRpcCompatibleItems = cartForRpc.length > 0;

    const rpcPayload = {
      total: cartTotalUsd,
      cart: cartForRpc.map(i => ({
          id: i._originalId || i.id,
          qty: i.qty,
          priceUsd: i.priceUsd,
          isCombo: i.isCombo || false,
          linkedProductId: i.linkedProductId || null,
          linkedQty: i.linkedQty || 1
      })),
      payments: payments.map(p => ({
        methodId: p.methodId,
        amountUsd: p.amountUsd,
        currency: p.currency || 'USD',
        methodLabel: p.methodLabel || p.methodId
      })),
      fiadoUsd: fiadoAmountUsd
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
    const legacyUser = useAuthStore.getState().usuarioActivo;
    const newUser = useNewAuthStore.getState().currentUser;
    const currentUser = newUser || legacyUser;
    const sale = {
        id: finalSaleId || crypto.randomUUID(),
        tipo: fiadoAmountUsd > 0 ? 'VENTA_FIADA' : 'VENTA',
        status: saleMode === 'online' ? 'COMPLETADA' : (saleMode === 'pending_verification' ? 'PENDIENTE_VERIFICACION' : 'PENDIENTE_SYNC'),
        vendedorId: currentUser?.id || null,
        vendedorNombre: currentUser?.nombre || currentUser?.name || 'Sistema',
        vendedorRol: currentUser?.rol || currentUser?.role || null,
        meseroId: meseroId || null,
        meseroNombre: meseroNombre || null,
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
        fiadoUsd: fiadoAmountUsd
    };

    const existingSales = await storageService.getItem(SALES_KEY, []);
    // saleNumber robusto: timestamp + random para evitar duplicados entre tabs
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');  // HHMMSS
    const randomPart = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const saleNumber = `${datePart}-${timePart}-${randomPart}`;
    const finalPersistedSale = Object.freeze({ ...sale, saleNumber });

    await storageService.setItem(SALES_KEY, [finalPersistedSale, ...existingSales]);

    // Audit log
    const tipo = fiadoAmountUsd > 0 ? 'VENTA_FIADO' : 'VENTA_COMPLETADA';
    logEvent('VENTA', tipo, `Venta #${saleNumber} [${saleMode.toUpperCase()}] - $${cartTotalUsd.toFixed(2)} - ${cart.length} items - ${selectedCustomer?.name || 'Consumidor Final'}`, currentUser, { saleId: finalPersistedSale.id, total: cartTotalUsd, items: cart.length });

    // ── CLIENT-SIDE STOCK DEDUCTION (optimistic UI only) ──
    // NOTE: The RPC `process_checkout` handles authoritative stock deduction
    // server-side within a transaction. This client-side deduction is ONLY for
    // optimistic UI updates so the user sees stock counts change immediately.
    // When the RPC succeeds (saleMode === 'online'), we skip client-side
    // deduction to avoid double-counting — the server is the source of truth.
    let updatedProducts = products;

    if (saleMode !== 'online') {
    // Calculate total deductions per product ID
    const deductions = {};
    cart.forEach(item => {
        let deduction = 0;
        if (item.isWeight) deduction = item.qty;
        else if (item._mode === 'unit') deduction = (item.qty / (item._unitsPerPackage || 1));
        else deduction = item.qty;

        if (item.isCombo && item.linkedProductId) {
            const linkedDeduction = deduction * (item.linkedQty || 1);
            deductions[item.linkedProductId] = (deductions[item.linkedProductId] || 0) + linkedDeduction;
            // Combos don't deduct their own stock, only the linked product
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

        // Validate that the customer actually has enough saldo a favor
        if (amount_favor_used > (selectedCustomer?.favor || 0) + EPSILON) {
            return { success: false, error: 'Saldo a favor insuficiente' };
        }

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
