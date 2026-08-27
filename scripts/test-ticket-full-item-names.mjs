import fs from 'node:fs';

const pdf = fs.readFileSync('src/utils/ticketGenerator.js', 'utf8');
const thermal = fs.readFileSync('src/utils/thermalTicketGenerator.js', 'utf8');
const serial = fs.readFileSync('src/services/webSerialPrinter.js', 'utf8');
if (/item\.name\.substring\(/.test(pdf)) throw new Error('PDF aún trunca item.name');
if (/item\.name\.length\s*>/.test(thermal)) throw new Error('Térmico aún limita item.name');
if (/const name = item\.name\.length/.test(serial)) throw new Error('ESC/POS aún trunca item.name');
if (!pdf.includes('splitTextToSize(item.name')) throw new Error('PDF no tiene ajuste multilinea');
if (!serial.includes('Nombre completo')) throw new Error('ESC/POS no declara nombre completo');
console.log('ticket-full-item-names: 3/3 ✅');
