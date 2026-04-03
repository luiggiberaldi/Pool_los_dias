export function calculateElapsedTime(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date();
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 60000);
    return diffMinutes;
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = 0) {
    if (gameMode === 'PINA') {
        // Piña mode has a fixed flat price regardless of time, but can be multiplied by rounds
        const basePrice = config.pricePina || 0;
        const rounds = 1 + (Number(extendedTimes) || 0);
        return basePrice * rounds;
    }

    if (gameMode === 'NORMAL') {
        const pricePerHour = config.pricePerHour || 0;
        
        if (elapsedMinutes <= 0 && hoursPaid <= 0) return 0;
        
        const billedHours = Math.ceil(elapsedMinutes / 60);
        // Si hay horas pagadas, siempre se cobra el mínimo de las horas pagadas. Si se pasa, cobra las extra
        const finalHours = Math.max(billedHours, hoursPaid);
        
        return finalHours * pricePerHour;
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
