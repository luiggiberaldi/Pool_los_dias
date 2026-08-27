import { round2, subR } from './dinero';

export function procesarImpactoCliente(clienteInicial, transaccion) {
    // CLONAR PARA INMUTABILIDAD
    let cliente = { ...clienteInicial };

    // INPUTS INTERMEDIOS
    const { usaSaldoFavor = 0, esCredito = false, deudaGenerada = 0, vueltoParaMonedero = 0 } = transaccion;

    // 0. Q0: CONSUMO DE SALDO A FAVOR
    if (usaSaldoFavor > 0) {
        // Validate: cap usaSaldoFavor to available balance to prevent over-deduction
        const disponible = round2(cliente.favor || 0);
        const efectivo = Math.min(usaSaldoFavor, disponible);
        if (usaSaldoFavor > disponible) {
            console.warn(
                `[financialLogic] usaSaldoFavor (${usaSaldoFavor}) excede saldo disponible (${disponible}). Capped to ${disponible}.`
            );
        }
        cliente.favor = round2(subR(disponible, efectivo));
    }

    // 1. Q1: GENERACIÓN DE DEUDA
    if (esCredito) {
        cliente.deuda = round2((cliente.deuda || 0) + deudaGenerada);
    }

    // 2. Q2 & Q3: VUELTO (ABONO A DEUDA O MONEDERO)
    // El "vuelto" digital es lo que sobra que NO se entregó en efectivo.
    if (vueltoParaMonedero > 0) {
        const deudaActual = round2(cliente.deuda || 0);

        if (deudaActual > 0.001) {
            // PRIORITY: DEBT FIRST
            if (deudaActual >= vueltoParaMonedero) {
                // Paga parte de la deuda
                cliente.deuda = round2(subR(deudaActual, vueltoParaMonedero));
                // Nada al favor real, todo se consumió en deuda
            } else {
                // Paga toda la deuda y sobra
                const sobra = round2(subR(vueltoParaMonedero, deudaActual));
                cliente.deuda = 0;
                cliente.favor = round2((cliente.favor || 0) + sobra); // Q3
            }
        } else {
            // No deuda, todo a favor
            cliente.favor = round2((cliente.favor || 0) + vueltoParaMonedero);
        }
    }

    // 3. NORMALIZACIÓN ESTRICTA (The Golden Rule)
    const saldoNeto = subR((cliente.favor || 0), (cliente.deuda || 0));

    if (saldoNeto >= 0) {
        cliente.favor = round2(saldoNeto);
        cliente.deuda = 0;
    } else {
        cliente.favor = 0;
        cliente.deuda = round2(Math.abs(saldoNeto));
    }

    return cliente;
}

/**
 * Inversa exacta de `procesarImpactoCliente` para anular una venta/transacción.
 * Sirve para el flujo de ANULACIÓN desde Reportes → Historial.
 * Debe aceptar tanto `customerId` (checkout) como `clienteId` (módulo Clientes)
 * en la venta, pero la resolución del id vive en el caller.
 * @param {Object} clienteInicial - Cliente actual (deuda/favor en USD)
 * @param {Object} sale - Venta/transacción a revertir
 * @returns {Object} Nuevo cliente con deuda/favor revertidos
 */
export function revertCustomerImpact(clienteInicial, sale) {
    if (!sale) return { ...clienteInicial };
    const c = { ...clienteInicial };

    // Fiado (genera deuda) → quitar la deuda generada
    const fiadoAmountUsd = sale.fiadoUsd || (sale.tipo === 'VENTA_FIADA' ? sale.totalUsd : 0) || 0;

    // Pago con saldo a favor → restaurar el favor consumido
    const favorUsed = sale.payments
        ?.filter(p => p.methodId === 'saldo_favor')
        .reduce((sum, p) => sum + (p.amountUsd || 0), 0) || 0;

    // Abono de deuda anulado → restaurar la deuda que ese pago redujo.
    // El abono SIEMPRE sube el neto (favor - deuda) en totalUsd (deuda primero,
    // luego favor), así que su inversa exacta es restar totalUsd al neto actual.
    const abonoUsd = sale.tipo === 'COBRO_DEUDA' ? round2(sale.totalUsd || 0) : 0;

    if (fiadoAmountUsd > 0) {
        c.deuda = round2(Math.max(0, (c.deuda || 0) - fiadoAmountUsd));
    }
    if (favorUsed > 0) {
        c.favor = round2((c.favor || 0) + favorUsed);
    }
    if (abonoUsd > 0) {
        const net = round2((c.favor || 0) - (c.deuda || 0) - abonoUsd);
        c.favor = net >= 0 ? net : 0;
        c.deuda = net < 0 ? round2(Math.abs(net)) : 0;
    }

    return c;
}
