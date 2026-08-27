import fs from 'node:fs';

const files = [
  'src/utils/ticketGenerator.js',
  'src/utils/thermalTicketGenerator.js',
  'src/services/webSerialPrinter.js',
  'src/utils/dailyCloseGenerator.js',
  'src/utils/letterCloseGenerator.js',
];
const forbidden = ['Tasa BCV:', 'Tasa Aplicada:', '(tasa actual)', 'Tasa COP:'];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const value of forbidden) {
    if (text.includes(value)) throw new Error(`${file}: referencia visible encontrada: ${value}`);
  }
}
console.log('no-rate-on-receipts: 5/5 ✅');
