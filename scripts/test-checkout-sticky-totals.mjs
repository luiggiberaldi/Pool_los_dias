import fs from 'node:fs';

const modal = fs.readFileSync('src/components/Sales/CheckoutModal.jsx', 'utf8');
const remaining = fs.readFileSync('src/components/Sales/CheckoutChangeBreakdown.jsx', 'utf8');
if (!modal.includes('data-tour="checkout-total"') || !modal.includes('sticky top-0')) {
  throw new Error('El total a pagar no está fijado durante el scroll');
}
if (!remaining.includes('data-tour="checkout-remaining"') || !remaining.includes('sticky top-0')) {
  throw new Error('La resta por cobrar no está fijada durante el scroll');
}
console.log('checkout-sticky-totals: 2/2 ✅');
