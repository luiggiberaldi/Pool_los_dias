import { round2 } from './dinero';

export function calculateElapsedTime(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date();
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 60000);
    return diffMinutes;
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = 0, paidAt = null, hoursOffset = 0) {
    // Si ya fue cobrada sin liberar, la deuda es $0 aunque el timer siga corriendo
    if (paidAt) return 0;

    if (gameMode === 'PINA') {
        // Piña mode has a fixed flat price regardless of time, but can be multiplied by rounds
        const basePrice = config.pricePina || 0;
        const rounds = 1 + (Number(extendedTimes) || 0);
        return basePrice * rounds;
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
