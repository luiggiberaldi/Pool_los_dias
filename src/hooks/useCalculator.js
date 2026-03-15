import { useState, useEffect } from 'react';

import { CurrencyService } from '../services/CurrencyService'; // [NEW]

export function useCalculator(rates) {
  const [amountTop, setAmountTop] = useState('');
  const [amountBot, setAmountBot] = useState('');
  const [from, setFrom] = useState('BCV');
  const [to, setTo] = useState('VES');
  const [lastEdited, setLastEdited] = useState('top');

  const currencies = [
    { id: 'VES', label: 'Bs.', icon: '🇻🇪', rate: 1 },
    { id: 'BCV', label: 'USD', icon: '💵', rate: rates.bcv.price },
    { id: 'EUR', label: 'Euro', icon: '💶', rate: rates.euro.price },
  ];

  // --- LÓGICA DE CONVERSIÓN (Efecto Principal) ---
  useEffect(() => {
    const rateFrom = currencies.find(c => c.id === from)?.rate || 0;
    const rateTo = currencies.find(c => c.id === to)?.rate || 0;
    if (rateTo === 0 || rateFrom === 0) return;

    if (lastEdited === 'top') {
      if (!amountTop) { setAmountBot(''); return; }

      const res = CurrencyService.calculateExchange(CurrencyService.safeParse(amountTop), rateFrom, rateTo);
      const finalVal = CurrencyService.applyRoundingRule(res, to);
      setAmountBot(finalVal);

    } else {
      if (!amountBot) { setAmountTop(''); return; }

      const res = CurrencyService.calculateExchange(CurrencyService.safeParse(amountBot), rateTo, rateFrom);
      const finalVal = CurrencyService.applyRoundingRule(res, from);
      setAmountTop(finalVal);
    }
  }, [amountTop, amountBot, from, to, rates, lastEdited]);

  // --- HANDLERS ---
  const handleAmountChange = (val, source) => {
    const currentCurrency = source === 'top' ? from : to;
    // Validación: Si es VES solo enteros, si no, decimales
    const isValid = currentCurrency === 'VES'
      ? /^\d*$/.test(val)
      : /^\d*\.?\d{0,2}$/.test(val.replace(/,/g, '.'));

    if (isValid) {
      if (source === 'top') { setAmountTop(val); setLastEdited('top'); }
      else { setAmountBot(val); setLastEdited('bot'); }
    }
  };

  const handleSwap = () => {
    setFrom(to);
    setTo(from);
    setAmountTop(amountBot);
    setLastEdited('top');
  };

  const handleQuickAdd = (val) => {
    const current = CurrencyService.safeParse(amountTop);
    const newVal = current + val;
    // Aplicar redondeo si la moneda origen es VES
    const finalVal = from === 'VES' ? Math.ceil(newVal).toString() : newVal.toFixed(0);
    setAmountTop(finalVal);
    setLastEdited('top');
  };

  const clear = () => { setAmountTop(''); setAmountBot(''); };

  return {
    amountTop, amountBot, from, to, currencies,
    setFrom, setTo,
    handleAmountChange, handleSwap, handleQuickAdd, clear,
    safeParse: CurrencyService.safeParse // Exportamos para usar en utilidades
  };
}
