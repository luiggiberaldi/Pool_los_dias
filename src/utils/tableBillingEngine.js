import { round2 } from './dinero';

export function calculateElapsedTime(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date();
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 60000);
    return diffMinutes;
}

/**
 * Calcula el desglose de costos de una sesión (piñas + horas por separado).
 * Soporta modo mixto: cualquier sesión puede tener piñas Y horas simultáneamente.
 */
export function calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, hoursOffset = 0, roundsOffset = 0, seats = null) {
    let pinaCost = 0;
    let hourCost = 0;

    // Piñas: PINA mode siempre tiene piñas.
    // Non-PINA: solo si extended_times > 0 (evita falso positivo por DB default 0).
    const hasPinas = gameMode === 'PINA' || (Number(extendedTimes) > 0);
    if (hasPinas) {
        const basePrice = config.pricePina || 0;
        let rounds;
        if (gameMode === 'PINA') {
            // PINA: la primera piña es implícita → rounds = 1 + extended_times
            rounds = 1 + (Number(extendedTimes) || 0);
        } else {
            // Non-PINA con piñas agregadas: extended_times ES el conteo directo
            rounds = Number(extendedTimes) || 0;
        }
        const billableRounds = Math.max(0, rounds - roundsOffset);
        pinaCost = round2(basePrice * billableRounds);
    }

    // Horas: cualquier sesión con hours_paid > 0 cobra por tiempo
    if (hoursPaid > 0) {
        const pricePerHour = config.pricePerHour || 0;
        const billableHours = Math.max(0, hoursPaid - hoursOffset);
        hourCost = round2(billableHours * pricePerHour);
    }

    // Modo libre eliminado — archivado en ARCHIVED_LIBRE_MODE.md
    const libreCost = 0;
    const isLibre = false;

    return {
        pinaCost,
        hourCost,
        libreCost,
        hasPinas,
        hasHours: hoursPaid > 0,
        isLibre,
        total: round2(pinaCost + hourCost)
    };
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, paidAt = null, hoursOffset = 0, roundsOffset = 0, seats = null) {
    // Si ya fue cobrada sin liberar, la deuda es $0
    if (paidAt) return 0;

    const breakdown = calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid, extendedTimes, hoursOffset, roundsOffset, seats);
    return breakdown.total;
}

/**
 * Calcula el costo en Bs con desglose separado para piñas y horas
 * (cada uno puede tener tasa Bs distinta configurada).
 */
export function calculateTimeCostBsBreakdown(pinaCost, hourCost, config, tasaBCV, libreCost = 0) {
    let pinaCostBs = 0;
    let hourCostBs = 0;
    let libreCostBs = 0;

    if (pinaCost > 0) {
        const priceBs = config.pricePinaBs || parseFloat(localStorage.getItem('pool_price_pina_bs')) || 0;
        const priceUsd = config.pricePina || 0;
        if (priceBs > 0 && priceUsd > 0) {
            pinaCostBs = round2(pinaCost * (priceBs / priceUsd));
        } else {
            pinaCostBs = round2(pinaCost * (tasaBCV || 1));
        }
    }

    if (hourCost > 0) {
        const priceBs = config.pricePerHourBs || parseFloat(localStorage.getItem('pool_price_per_hour_bs')) || 0;
        const priceUsd = config.pricePerHour || 0;
        if (priceBs > 0 && priceUsd > 0) {
            hourCostBs = round2(hourCost * (priceBs / priceUsd));
        } else {
            hourCostBs = round2(hourCost * (tasaBCV || 1));
        }
    }

    if (libreCost > 0) {
        const priceBs = config.pricePerHourBs || parseFloat(localStorage.getItem('pool_price_per_hour_bs')) || 0;
        const priceUsd = config.pricePerHour || 0;
        if (priceBs > 0 && priceUsd > 0) {
            libreCostBs = round2(libreCost * (priceBs / priceUsd));
        } else {
            libreCostBs = round2(libreCost * (tasaBCV || 1));
        }
    }

    return { pinaCostBs, hourCostBs, libreCostBs, totalBs: round2(pinaCostBs + hourCostBs + libreCostBs) };
}

/**
 * Calcula el costo de tiempo en Bolívares (backward compatible).
 * Para modo mixto, usa calculateTimeCostBsBreakdown directamente.
 */
export function calculateTimeCostBs(costUSD, gameMode, config, tasaBCV) {
    if (costUSD <= 0) return 0;

    let priceBs, priceUsd;
    if (gameMode === 'PINA') {
        priceBs = config.pricePinaBs || parseFloat(localStorage.getItem('pool_price_pina_bs')) || 0;
        priceUsd = config.pricePina || 0;
    } else {
        priceBs = config.pricePerHourBs || parseFloat(localStorage.getItem('pool_price_per_hour_bs')) || 0;
        priceUsd = config.pricePerHour || 0;
    }

    if (priceBs > 0 && priceUsd > 0) {
        return round2(costUSD * (priceBs / priceUsd));
    }

    return round2(costUSD * (tasaBCV || 1));
}

/**
 * Calcula el total de consumo en Bs usando unit_price_bs por item cuando está disponible.
 * Para combos sin unit_price_bs en DB, busca el priceBs del producto local.
 * Si no tiene priceBs, usa unit_price_usd * tasa.
 */
/**
 * Calcula el total de consumo en Bs usando unit_price_bs por item cuando está disponible.
 * Para combos sin unit_price_bs en DB, busca el priceBs del producto en la lista de productos.
 * Si no tiene priceBs, usa unit_price_usd * tasa.
 * @param {Array} items - order items con product_id, unit_price_usd, unit_price_bs, qty
 * @param {number} tasaBCV - tasa de cambio
 * @param {Array} [productsList] - lista de productos locales para buscar priceBs de combos
 */
export function calculateConsumptionBs(items, tasaBCV, productsList = null) {
    if (!items || items.length === 0) return 0;
    const products = productsList || [];
    return round2(items.reduce((acc, item) => {
        const qty = Number(item.qty) || 0;
        // 1. DB has unit_price_bs
        if (item.unit_price_bs != null && Number(item.unit_price_bs) > 0) {
            return acc + Number(item.unit_price_bs) * qty;
        }
        // 2. Fallback: lookup product's priceBs (for combos with independent Bs pricing)
        const product = products.find(p => p.id === item.product_id);
        if (product && product.isCombo && product.priceBs > 0) {
            return acc + product.priceBs * qty;
        }
        // 3. Default: USD * rate
        return acc + (Number(item.unit_price_usd) || 0) * qty * (tasaBCV || 1);
    }, 0));
}

/**
 * Calcula el gran total en Bs: tiempo con tasa implícita + consumo con tasa BCV.
 * Acepta un breakdown opcional para modo mixto (convierte piñas y horas por separado).
 * consumoBsOverride: si se pasa, usa ese valor para el consumo en Bs en vez de totalConsumption * tasa.
 */
export function calculateGrandTotalBs(timeCost, totalConsumption, gameMode, config, tasaBCV, breakdown = null, consumoBsOverride = null) {
    let timeBs;
    if (breakdown && (breakdown.pinaCost > 0 || breakdown.hourCost > 0 || breakdown.libreCost > 0)) {
        const mixed = calculateTimeCostBsBreakdown(breakdown.pinaCost, breakdown.hourCost, config, tasaBCV, breakdown.libreCost);
        timeBs = mixed.totalBs;
    } else {
        timeBs = calculateTimeCostBs(timeCost, gameMode, config, tasaBCV);
    }
    const consumoBs = consumoBsOverride != null ? round2(consumoBsOverride) : round2(totalConsumption * (tasaBCV || 1));
    return round2(timeBs + consumoBs);
}

/**
 * Formats elapsed minutes into HH:MM or MM:SS depending on length
 */
export function formatElapsedTime(elapsedMinutes) {
    if (elapsedMinutes < 0) return "00:00";

    if (elapsedMinutes < 60) {
        return `${elapsedMinutes.toString().padStart(2, '0')} min`;
    }

    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;

    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

/**
 * Formats hours_paid (decimal) into a human-readable string.
 * 0.5 → "1/2 h", 1 → "1 h", 1.5 → "1 1/2 h", 2 → "2 h"
 */
export function formatHoursPaid(hours) {
    if (!hours || hours <= 0) return "0 h";
    const whole = Math.floor(hours);
    const hasHalf = (hours - whole) >= 0.45; // tolerancia para 0.5

    if (whole === 0 && hasHalf) return '1/2 h';
    if (hasHalf) return `${whole} 1/2 h`;
    return `${whole} h`;
}

/**
 * Calcula el total en Bs de los timeCharges de seats (piñas + horas asignadas a clientes).
 * Usa la tasa implícita de config para cada tipo (no tasa BCV genérica).
 */
export function calculateSeatTimeCostBs(seats, config, tasaBCV) {
    if (!seats || seats.length === 0) return 0;
    const unpaid = seats.filter(s => !s.paid);
    let seatPinaCost = 0;
    let seatHourCost = 0;
    for (const s of unpaid) {
        const tc = s.timeCharges || [];
        const pinas = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const hours = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        seatPinaCost += pinas * (config.pricePina || 0);
        seatHourCost += hours * (config.pricePerHour || 0);
    }
    if (seatPinaCost === 0 && seatHourCost === 0) return 0;
    return calculateTimeCostBsBreakdown(round2(seatPinaCost), round2(seatHourCost), config, tasaBCV).totalBs;
}

/**
 * Calcula el costo de timeCharges individuales de un seat.
 * timeCharges: [{ type: 'hora'|'pina', amount: number }]
 */
export function calculateSeatTimeChargesCost(timeCharges, config) {
    if (!timeCharges || timeCharges.length === 0) {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    const totalHours = timeCharges.filter(tc => tc.type === 'hora').reduce((sum, tc) => sum + (Number(tc.amount) || 0), 0);
    const totalPinas = timeCharges.filter(tc => tc.type === 'pina').reduce((sum, tc) => sum + (Number(tc.amount) || 0), 0);
    const hourCost = round2(totalHours * (config.pricePerHour || 0));
    const pinaCost = round2(totalPinas * (config.pricePina || 0));
    return {
        pinaCost,
        hourCost,
        libreCost: 0,
        hasPinas: totalPinas > 0,
        hasHours: totalHours > 0,
        isLibre: false,
        total: round2(hourCost + pinaCost)
    };
}

/**
 * Calcula el costo de UN seat según su gameMode individual.
 * Soporta nuevo estilo (timeCharges) y legacy (gameMode/hoursPaid/pinas).
 * seat: { timeCharges?, gameMode?, hoursPaid?, pinas? }
 */
export function calculateSeatCostBreakdown(seat, elapsedMinutes, config) {
    if (!seat) {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    // Nuevo estilo: usa timeCharges si existen
    if (seat.timeCharges && seat.timeCharges.length > 0) {
        return calculateSeatTimeChargesCost(seat.timeCharges, config);
    }
    // Legacy: usa gameMode/hoursPaid/pinas
    if (!seat.gameMode || seat.gameMode === 'NONE') {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    if (seat.gameMode === 'PINA') {
        const pinas = seat.pinas || 1;
        return calculateSessionCostBreakdown(elapsedMinutes, 'PINA', config, 0, pinas - 1);
    }
    if (seat.gameMode === 'HOURS') {
        const hours = seat.hoursPaid || 0;
        return calculateSessionCostBreakdown(elapsedMinutes, 'NORMAL', config, hours, 0);
    }
    // gameMode LIBRE eliminado — retorna $0
    if (seat.gameMode === 'LIBRE') {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
}

/**
 * Calcula el desglose completo de una mesa con seats/clientes.
 * Si seats está vacío, retorna null (usar cálculo legacy de sesión).
 * orderItems: array de items con seat_id (null = compartido).
 * sharedTimeOverride: si se pasa, es el monto compartido de tiempo ya calculado externamente.
 * sharedDivision: { type: 'equal' } | { type: 'custom', amounts: { [seatId]: number } }
 * isTimeFree: si true, no cobra tiempo de sesión (mesas tipo NORMAL/BAR).
 */
export function calculateFullTableBreakdown(session, seats, elapsedMinutes, config, orderItems = [], sharedDivision = null, frozenDivisor = null, isTimeFree = false, hoursOffset = 0, roundsOffset = 0) {
    if (!seats || seats.length === 0) return null;

    const activeSeats = seats.filter(s => !s.paid);
    const allSeats = seats;
    const sharedItems = orderItems.filter(i => !i.seat_id);
    const sharedConsumptionTotal = sharedItems.reduce((acc, i) => acc + (Number(i.unit_price_usd) * Number(i.qty)), 0);

    // Costo de tiempo compartido (session-level: piñas + horas sin seatId)
    const sessionTimeCost = isTimeFree
        ? { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 }
        : calculateSessionCostBreakdown(
            elapsedMinutes,
            session.game_mode,
            config,
            session.hours_paid || 0,
            session.extended_times || 0,
            hoursOffset,
            roundsOffset,
            seats // pass seats so isLibre check considers seat-level hours
        );
    const sharedTimeTotal = sessionTimeCost.total;
    const sharedTotal = round2(sharedConsumptionTotal + sharedTimeTotal);
    const activeCount = (frozenDivisor !== null && frozenDivisor !== undefined && frozenDivisor > 0) ? frozenDivisor : activeSeats.length;

    const getSharedPortion = (seat) => {
        if (seat.paid) return 0;
        if (!sharedDivision || sharedDivision.type === 'equal') {
            return activeCount > 0 ? round2(sharedTotal / activeCount) : 0;
        }
        if (sharedDivision.type === 'custom') {
            return round2(parseFloat(sharedDivision.amounts?.[seat.id]) || 0);
        }
        return activeCount > 0 ? round2(sharedTotal / activeCount) : 0;
    };

    const seatBreakdowns = allSeats.map(seat => {
        const timeCost = calculateSeatCostBreakdown(seat, elapsedMinutes, config);
        const seatItems = orderItems.filter(i => i.seat_id === seat.id);
        const consumption = seatItems.reduce((acc, i) => acc + (Number(i.unit_price_usd) * Number(i.qty)), 0);
        const sharedPortion = getSharedPortion(seat);
        return {
            seat,
            timeCost,
            items: seatItems,
            consumption: round2(consumption),
            sharedPortion,
            subtotal: round2(timeCost.total + consumption + sharedPortion)
        };
    });

    const grandTotal = seatBreakdowns.filter(sb => !sb.seat.paid).reduce((acc, sb) => acc + sb.subtotal, 0);

    return {
        seats: seatBreakdowns,
        sharedItems,
        sharedConsumptionTotal: round2(sharedConsumptionTotal),
        sharedTimeTotal: round2(sharedTimeTotal),
        sharedTotal: round2(sharedTotal),
        sharedPerSeat: activeCount > 0 ? round2(sharedTotal / activeCount) : 0,
        sessionTimeCost,
        grandTotal: round2(grandTotal)
    };
}

/**
 * Calcula el total en Bs de un full table breakdown usando la tasa implícita
 * de la configuración para el tiempo y la tasa BCV para el consumo.
 * Esto evita usar solo tasa BCV para todo (que da montos incorrectos en mesas).
 */
export function calculateBreakdownTotalBs(seatBreakdown, config, tasaBCV) {
    if (!seatBreakdown) return 0;

    // Shared time cost en Bs (usa tasa implícita de config)
    const sharedTimeBs = calculateTimeCostBsBreakdown(
        seatBreakdown.sessionTimeCost.pinaCost,
        seatBreakdown.sessionTimeCost.hourCost,
        config, tasaBCV,
        seatBreakdown.sessionTimeCost.libreCost
    ).totalBs;

    // Per-seat time costs en Bs (usa tasa implícita de config)
    const seatTimeBs = seatBreakdown.seats
        .filter(sb => !sb.seat.paid)
        .reduce((acc, sb) => {
            const bs = calculateTimeCostBsBreakdown(
                sb.timeCost.pinaCost || 0,
                sb.timeCost.hourCost || 0,
                config, tasaBCV,
                sb.timeCost.libreCost || 0
            );
            return acc + bs.totalBs;
        }, 0);

    // Consumption en Bs (usa tasa BCV)
    const consumptionUsd = seatBreakdown.sharedConsumptionTotal +
        seatBreakdown.seats.filter(sb => !sb.seat.paid).reduce((acc, sb) => acc + sb.consumption, 0);
    const consumptionBs = round2(consumptionUsd * (tasaBCV || 1));

    return round2(sharedTimeBs + seatTimeBs + consumptionBs);
}
