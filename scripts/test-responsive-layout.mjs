import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('src/App.jsx');
const css = read('src/index.css');
const views = Object.fromEntries([
  ['Dashboard', 'src/views/DashboardView.jsx'],
  ['Sales', 'src/views/SalesView.jsx'],
  ['Products', 'src/views/ProductsView.jsx'],
  ['Tables', 'src/views/TablesView.jsx'],
  ['Customers', 'src/views/CustomersView.jsx'],
  ['Reports', 'src/views/ReportsView.jsx'],
  ['Settings', 'src/views/SettingsView.jsx'],
].map(([name, path]) => [name, read(path)]));

const checks = [
  ['root usa 100dvh', css.includes('min-height: 100dvh')],
  ['root evita overflow horizontal', css.includes('overflow-x: hidden')],
  ['existe utilidad de navegación segura', css.includes('.pb-app-nav') && css.includes('safe-area-inset-bottom')],
  ['main no crea scroll global duplicado', app.includes('flex flex-col overflow-hidden')],
  ['nav respeta safe area', app.includes('pb-[env(safe-area-inset-bottom)]')],
  ['ventas cambia a dos columnas desde md', views.Sales.includes('md:flex-row') && views.Sales.includes('md:w-[320px]')],
  ['dashboard usa padding responsive del nav', views.Dashboard.includes('pb-app-nav')],
  ['reportes usa min-h-0 y padding responsive', views.Reports.includes('min-h-0') && views.Reports.includes('pb-app-nav')],
  ['configuración usa min-h-0', views.Settings.includes('min-h-0')],
  ['clientes usa padding responsive', views.Customers.includes('pb-app-nav')],
  ['inventario usa padding responsive', views.Products.includes('pb-app-nav')],
  ['mesas usa padding responsive', views.Tables.includes('pb-app-nav')],
  ['controles táctiles no esperan doble click', css.includes('touch-action: manipulation')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${label}`);
if (failed.length) process.exit(1);
console.log(`${checks.length}/${checks.length} responsive invariants ✅`);
