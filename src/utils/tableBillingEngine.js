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
export function calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, hoursOffset = 0, roundsOffset = 0) {
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

    // Libre: game_mode NORMAL sin horas prepagadas → cobro por minuto
    let libreCost = 0;
    const isLibre = gameMode === 'NORMAL' && hoursPaid === 0;
    if (isLibre && elapsedMinutes > 0) {
        const pricePerHour = config.pricePerHour || 0;
        libreCost = round2((elapsedMinutes / 60) * pricePerHour);
    }

    return {
        pinaCost,
        hourCost,
        libreCost,
        hasPinas,
        hasHours: hoursPaid > 0,
        isLibre,
        total: round2(pinaCost + hourCost + libreCost)
    };
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, paidAt = null, hoursOffset = 0, roundsOffset = 0) {
    // Si ya fue cobrada sin liberar, la deuda es $0
    if (paidAt) return 0;

    const breakdown = calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid, extendedTimes, hoursOffset, roundsOffset);
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
 * Calcula el gran total en Bs: tiempo con tasa implícita + consumo con tasa BCV.
 * Acepta un breakdown opcional para modo mixto (convierte piñas y horas por separado).
 */
export function calculateGrandTotalBs(timeCost, totalConsumption, gameMode, config, tasaBCV, breakdown = null) {
    let timeBs;
    if (breakdown && (breakdown.pinaCost > 0 || breakdown.hourCost > 0 || breakdown.libreCost > 0)) {
        const mixed = calculateTimeCostBsBreakdown(breakdown.pinaCost, breakdown.hourCost, config, tasaBCV, breakdown.libreCost);
        timeBs = mixed.totalBs;
    } else {
        timeBs = calculateTimeCostBs(timeCost, gameMode, config, tasaBCV);
    }
    const consumoBs = round2(totalConsumption * (tasaBCV || 1));
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
