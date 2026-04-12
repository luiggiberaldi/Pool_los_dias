import { round2 } from './dinero';

export function calculateElapsedTime(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date();
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 60000);
    return diffMinutes;
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = 0, paidAt = null, hoursOffset = 0, roundsOffset = 0) {
    // Si ya fue cobrada sin liberar, la deuda es $0 aunque el timer siga corriendo
    if (paidAt) return 0;

    if (gameMode === 'PINA') {
        // Piña mode has a fixed flat price regardless of time, but can be multiplied by rounds
        const basePrice = config.pricePina || 0;
        const rounds = 1 + (Number(extendedTimes) || 0);
        // roundsOffset = piñas ya cobradas en un ciclo anterior (cobrar sin liberar)
        const billableRounds = Math.max(0, rounds - roundsOffset);
        return round2(basePrice * billableRounds);
    }

    if (gameMode === 'NORMAL') {
        // Si se pagaron horas por adelantado (mesa de pool con prepago), sí se cobra el tiempo.
        // hoursOffset = horas ya cobradas en un ciclo anterior (cobrar sin liberar).
        if (hoursPaid > 0) {
            const pricePerHour = config.pricePerHour || 0;
            const billableHours = Math.max(0, hoursPaid - hoursOffset);
            return round2(billableHours * pricePerHour);
        }
        return 0;
    }

    if (gameMode === 'PREPAGO') {
        const pricePerHour = config.pricePerHour || 0;
        if (hoursPaid <= 0) return 0;
        const billableHours = Math.max(0, hoursPaid - hoursOffset);
        return round2(billableHours * pricePerHour);
    }

    return 0;
}

/**
 * Calcula el costo de tiempo en Bolívares usando los precios Bs independientes.
 * Si no hay precio Bs configurado, usa fallback: costUSD * tasaBCV.
 * @param {number} costUSD — costo ya calculado en USD por calculateSessionCost
 * @param {string} gameMode — PINA, NORMAL, PREPAGO
 * @param {object} config — { pricePerHour, pricePerHourBs, pricePina, pricePinaBs }
 * @param {number} tasaBCV — tasa BCV actual (fallback)
 * @returns {number} costo en Bs
 */
export function calculateTimeCostBs(costUSD, gameMode, config, tasaBCV) {
    if (costUSD <= 0) return 0;

    if (gameMode === 'PINA') {
        const priceBs = config.pricePinaBs || 0;
        const priceUsd = config.pricePina || 0;
        // Si tiene precio Bs independiente, calcular proporcionalmente
        if (priceBs > 0 && priceUsd > 0) {
            return round2(costUSD * (priceBs / priceUsd));
        }
    } else {
        // NORMAL y PREPAGO usan pricePerHour
        const priceBs = config.pricePerHourBs || 0;
        const priceUsd = config.pricePerHour || 0;
        if (priceBs > 0 && priceUsd > 0) {
            return round2(costUSD * (priceBs / priceUsd));
        }
    }

    // Fallback: usar tasa BCV
    return round2(costUSD * (tasaBCV || 1));
}

/**
 * Calcula el gran total en Bs: tiempo con tasa implícita + consumo con tasa BCV.
 */
export function calculateGrandTotalBs(timeCost, totalConsumption, gameMode, config, tasaBCV) {
    const timeBs = calculateTimeCostBs(timeCost, gameMode, config, tasaBCV);
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
