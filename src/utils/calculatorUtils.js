// [CONFIGURACIÓN] Comisión de efectivo REMOVIDA
// La tasa de efectivo ahora depende exclusivamente de la calibración manual del usuario

// Formateadores
export const formatBs = (val) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
export const formatUsd = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

/** Capitaliza la primera letra de cada palabra en un nombre */
export const capitalizeName = (str) => {
    if (!str || typeof str !== 'string') return str || '';
    return str.replace(/\b\w/g, c => c.toUpperCase());
};

// [REDONDEO INTELIGENTE PARA EFECTIVO]
// Regla: Si decimal <= 0.20 -> Redondeo abajo (Floor)
//        Si decimal > 0.20  -> Redondeo arriba (Ceil)
export const smartCashRounding = (amount) => {
    const integer = Math.floor(amount);
    const decimal = amount - integer;
    return decimal <= 0.2001 ? integer : integer + 1; // Usamos 0.2001 para margen de error flotante
};

import { MessageService } from '../services/MessageService';

// Re-export deprecated function referencing the new service
export const generatePaymentMessage = (params) => {
    return MessageService.buildPaymentMessage(params);
};

// Normaliza número venezolano al formato internacional para wa.me
// Acepta: 04121234567 → 584121234567
//         4121234567  → 584121234567
//         584121234567 → 584121234567
export const formatVzlaPhone = (raw) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('58') && digits.length >= 12) return digits;
    if (digits.startsWith('0')) return '58' + digits.slice(1);
    if (digits.length >= 10) return '58' + digits;
    return null;
};

import { round2 } from './dinero';

/**
 * Normaliza y calcula el valor real en Bolívares de una venta.
 * Respeta:
 * 1. Pagos reales recibidos en Bs (Punto de Venta / Pago Móvil / Efectivo Bs)
 * 2. Precios fijos independientes de mesas (pricePerHourBs / pricePinaBs)
 * 3. Conversión por Tasa Aplicada (s.totalUsd * s.rate)
 * 4. Fallback seguro a s.totalBs
 */
export const getSaleBs = (s) => {
    if (!s || s.status === 'ANULADA') return 0;

    // REGLA 1: Cobros en Bolívares (Punto de Venta / Pago Móvil / Efectivo Bs)
    const bsPayments = s.payments?.filter(p => p.currency === 'BS' || p.methodId?.includes('_bs') || p.methodId === 'pago_movil' || p.methodId === 'punto_de_venta');
    if (bsPayments?.length > 0) {
        const sumPaidBs = bsPayments.reduce((acc, p) => acc + (p.amountInput || p.amountBs || 0), 0);
        if (sumPaidBs > 0) return round2(sumPaidBs);
    }

    // REGLA 2: Respetar Precios Independientes de Mesas (pricePerHourBs / pricePinaBs)
    if (s.totalBs > 0 && Math.abs(s.totalBs - (s.totalUsd * (s.rate || 1))) > 5 && !s.rateSource?.includes('Auto')) {
        return round2(s.totalBs);
    }

    // REGLA 3: Conversión por Tasa Aplicada (ej: 800 Bs/$)
    const saleRate = s.rate || 0;
    if (s.totalUsd > 0 && saleRate > 0) {
        return round2(s.totalUsd * saleRate);
    }

    // REGLA 4: Fallback seguro
    return round2(s.totalBs || 0);
};
