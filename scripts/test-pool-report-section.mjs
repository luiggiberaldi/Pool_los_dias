import fs from 'node:fs';

let passed = 0;
let failed = 0;
const ok = (condition, label) => {
    if (condition) { passed++; console.log(`✅ ${label}`); }
    else { failed++; console.error(`❌ ${label}`); }
};
const isPoolServiceItem = (item) => {
    if (!item) return false;
    if (item.category === 'servicios') return true;
    const name = String(item.name || '').toLowerCase().trim();
    return name.startsWith('tiempo') || name.startsWith('piña') || name.startsWith('pina')
        || name.startsWith('partida') || name.startsWith('compartido') || name.includes('mesa ');
};
const parseHoursFromItem = (item) => {
    if (typeof item.hours === 'number' && item.hours > 0) return item.hours * (item.qty || 1);
    if (typeof item.durationMinutes === 'number' && item.durationMinutes > 0) return item.durationMinutes / 60 * (item.qty || 1);
    const name = item.name || '';
    const qty = item.qty || 1;
    const h = name.match(/\((\d+(?:\.\d+)?)\s*h\)/i);
    const m = name.match(/\((\d+)\s*min\)/i);
    if (h) return Number(h[1]) * qty;
    if (m) return Number(m[1]) / 60 * qty;
    if (name.includes('1/2')) return 0.5 * qty;
    if (name.includes('1/4')) return 0.25 * qty;
    if (name.includes('3/4')) return 0.75 * qty;
    return qty;
};
const calculatePoolServices = (sales, bcvRate = 0) => {
    const r = { pinaCount: 0, pinaUsd: 0, pinaBs: 0, hours: 0, hoursUsd: 0, hoursBs: 0, sharedUsd: 0, sharedBs: 0, totalUsd: 0, totalBs: 0 };
    (sales || []).filter(s => s.status !== 'ANULADA' && (s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA')).forEach(s => {
        const rate = Number(s.rate) > 0 ? Number(s.rate) : bcvRate;
        (s.items || []).filter(isPoolServiceItem).forEach(item => {
            const qty = Number(item.qty) || 0;
            const usd = (Number(item.priceUsd) || 0) * qty;
            const bs = item.exactBs != null ? (Number(item.exactBs) || 0) * qty : usd * rate;
            const name = String(item.name || '').toLowerCase();
            if (name.includes('piña') || name.includes('pina') || name.includes('partida')) { r.pinaCount += qty; r.pinaUsd += usd; r.pinaBs += bs; }
            else if (name.includes('compartido')) { r.sharedUsd += usd; r.sharedBs += bs; }
            else { r.hours += parseHoursFromItem(item); r.hoursUsd += usd; r.hoursBs += bs; }
        });
    });
    r.totalUsd = r.pinaUsd + r.hoursUsd + r.sharedUsd;
    r.totalBs = r.pinaBs + r.hoursBs + r.sharedBs;
    return r;
};

const sales = [{ tipo: 'VENTA', status: 'COMPLETADA', rate: 800, items: [
    { name: 'Piña Mesa 1', category: 'servicios', qty: 2, priceUsd: 0.5, exactBs: 500 },
    { name: 'Tiempo Mesa 1 (2 h)', category: 'servicios', qty: 1, priceUsd: 10, exactBs: 8000 },
    { name: 'Compartido Mesa 1 (÷2)', category: 'servicios', qty: 1, priceUsd: 1.5, exactBs: 1200 },
]}, { tipo: 'VENTA', status: 'ANULADA', rate: 800, items: [{ name: 'Piña anulada', category: 'servicios', qty: 9, priceUsd: 0.5, exactBs: 500 }] }, { tipo: 'COBRO_DEUDA', status: 'COMPLETADA', items: [{ name: 'Piña abono', category: 'servicios', qty: 7, priceUsd: 0.5, exactBs: 500 }] }];
const r = calculatePoolServices(sales, 800);
ok(r.pinaCount === 2, `Cuenta piñas válidas: ${r.pinaCount}`);
ok(r.pinaUsd === 1 && r.pinaBs === 1000, 'Piñas: $1 / Bs 1.000 dual');
ok(r.hours === 2 && r.hoursUsd === 10 && r.hoursBs === 8000, 'Horas: 2 / $10 / Bs 8.000 dual');
ok(r.sharedUsd === 1.5 && r.sharedBs === 1200, 'Compartido separado: $1,50 / Bs 1.200');
ok(r.totalUsd === 12.5 && r.totalBs === 10200, 'Total pool: $12,50 / Bs 10.200');
const legacy = calculatePoolServices([{ tipo: 'VENTA', status: 'COMPLETADA', rate: 800, items: [{ name: 'Piña legacy', category: 'servicios', qty: 1, priceUsd: 0.5 }] }], 800);
ok(legacy.pinaBs === 400, 'Fallback legacy: USD × tasa de venta');
for (const file of ['src/utils/dailyCloseGenerator.js', 'src/utils/letterCloseGenerator.js']) {
    const text = fs.readFileSync(file, 'utf8');
    ok(text.includes('calculatePoolServices(allSales, bcvRate'), `${file}: cálculo compartido conectado`);
    ok(text.includes('totalPinasBs') && text.includes('totalHoursBs'), `${file}: valores Bs duales conectados`);
}
if (failed) { console.error(`FAIL: ${failed} de ${passed + failed}`); process.exit(1); }
console.log(`PASS: ${passed}/${passed} invariantes de Servicios de Pool`);
