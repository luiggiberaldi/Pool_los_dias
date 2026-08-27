import fs from 'node:fs';

const files = {
  app: 'src/App.jsx',
  css: 'src/index.css',
  reports: 'src/views/ReportsView.jsx',
  products: 'src/views/ProductsView.jsx',
  customers: 'src/views/CustomersView.jsx',
  tables: 'src/views/TablesView.jsx',
  sales: 'src/views/SalesView.jsx',
  settings: 'src/views/SettingsView.jsx',
};
for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Falta ${path}`);
}
const app = fs.readFileSync(files.app, 'utf8');
const css = fs.readFileSync(files.css, 'utf8');
if (!app.includes('min-h-0') || !app.includes('overflow-y-auto')) throw new Error('El contenedor raíz no permite scroll flexível');
if (!css.includes('.pb-app-nav')) throw new Error('Falta espacio seguro para nav');
for (const key of ['reports','products','customers','tables','sales','settings']) {
  const text = fs.readFileSync(files[key], 'utf8');
  if (!text.includes('min-h-0') && !text.includes('overflow-y-auto')) throw new Error(`${key} no tiene estrategia de altura/scroll`);
}
console.log('test:desktop-scroll-all-views 8/8 ✅');
