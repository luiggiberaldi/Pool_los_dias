# 📓 Bitácora de Desarrollo — Pool Los Diaz POS

> Registro cronológico de avances, bugs resueltos y decisiones técnicas.
> Última actualización: **18 Abril 2026**

---

## 📍 ¿Dónde estamos?

**Todas las fases de desarrollo (0–11) están completadas.** El sistema está en producción con gestión completa de mesas, ventas, caja, inventario, contactos, deudas de empleados, y motor de facturación dual (sesión + seats). Se realizan correcciones y mejoras incrementales según necesidades del negocio.

---

## ✅ FASE 0 — Infraestructura Base (COMPLETADA)

### Branding y Migración de Identidad
- [x] Eliminadas todas las referencias a "Listo POS" / "Listo Lite"
- [x] Rebranding global a **"Pool Los Diaz"** y "Pool Los Diaz Premium"
- [x] `vite.config.js` — nombre PWA actualizado
- [x] `TermsOverlay.jsx` — términos y condiciones actualizados
- [x] `PremiumGuard.jsx` — mensajes de licencia actualizados

### Motor de Ventas y Base de Datos
- [x] Función RPC `process_checkout` desplegada en Supabase (`raxcxddreghynthyvllh`)
- [x] Función RPC `validate_double_entry` desplegada
- [x] `offlineQueueService.js` — cola de emergencia operativa
- [x] `useCloudSync.js` — sincronización P2P en tiempo real operativa

### Tickets Térmicos 58mm
- [x] Logo en ticket con **aspect ratio dinámico** (sin distorsión)
- [x] `ticketGenerator.js` — ancho fijo en 58mm
- [x] `dailyCloseGenerator.js` — ancho fijo en 58mm

---

## ✅ FASE 1 — Login con PIN y Roles (COMPLETADA)

- [x] `authStore.js` — Store de auth con `staff_users` de Supabase
- [x] `LoginScreen.jsx` — Pantalla conectada a `App.jsx`
- [x] `PinPad.jsx` — Teclado numérico táctil
- [x] `Guards.jsx` — `<AdminRoute>`, `<CashierRoute>`, etc.
- [x] Migración SQL: tablas `staff_users` y `cash_sessions`
- [x] Bloqueo del UI a operadores sin caja activa (`CashClosedLockScreen`)

---

## ✅ FASE 2 — Plano de Mesas (COMPLETADA)

- [x] Migración SQL: tablas `tables` y `table_sessions`
- [x] Motor de timers y facturación de mesas (`tableBillingEngine.js`)
- [x] `TablesView.jsx` — Vista del plano de mesas
- [x] `TableCard.jsx` — Tarjeta con timer regresivo y desglose de costos
- [x] Filtros por tipo (Pool/Bar) y estado (Libres/Ocupadas)
- [x] CRUD de mesas (Admin)
- [x] Tipos: Mesa de Pool (con timer) vs Mesa Normal (sin costo por tiempo)

---

## ✅ FASE 3 — Órdenes y Comandas (COMPLETADA)

- [x] Tablas `orders`, `order_items`, `payments`
- [x] `OrderPanel.jsx` — Panel de consumo por mesa
- [x] Modal "Detalle de Cuenta" con desglose dual ($/Bs)
- [x] Diferenciación visual: Pool (Cielo) vs Bar (Violeta)
- [x] Motor de impresión por mesa (ticket parcial)
- [x] Flujo de cobro integrado con `checkoutProcessor.js`

---

## ✅ FASE 4 — Apertura y Cierre de Caja (COMPLETADA)

- [x] Tabla `cash_sessions` con fondo inicial, tasas, arqueo
- [x] Pantalla de apertura de caja
- [x] Cierre ciego implementado
- [x] Ticket de cierre (`dailyCloseGenerator.js`)
- [x] Historial en `ReportsView.jsx`

---

## ✅ FASE 5 — Inventario de Barra (COMPLETADA)

- [x] Catálogo de productos con tabla `products` en Supabase
- [x] Descuento automático de stock en checkout
- [x] Alertas de stock bajo configurables
- [x] Filtros por categoría, búsqueda, paginación
- [x] Soporte de lotes/bultos con precio unitario calculado

---

## ✅ FASE 6 — Refactorización de Código (COMPLETADA — 05/04/2026)

Modularización de todos los archivos con más de 600 líneas.

### Vistas Refactorizadas

| Archivo | Antes | Después | Extracciones |
|---------|-------|---------|--------------|
| `DashboardView.jsx` | 1257 | ~580 | `useDashboardMetrics.js` |
| `CustomersView.jsx` | 1010 | 438 | `CustomerCard.jsx`, `CustomerModals.jsx` |
| `ProductsView.jsx` | 1000 | 522 | `useProductForm.js`, `useProductPagination.js` |
| `SalesView.jsx` | 968 | 445 | `useSalesData.js`, `useSalesCheckout.js` |
| `ticketGenerator.js` | 751 | 381 | `thermalTicketGenerator.js`, `tableTicketGenerator.js` |
| `ReportsView.jsx` | 748 | 448 | `TransactionRow.jsx`, `PaymentBreakdownCard.jsx`, `useReportsData.js` |
| `CheckoutModal.jsx` | 724 | 449 | `useCheckoutPayments.js`, `CustomerPickerSection.jsx` |

---

## ✅ FASE 7 — Onboarding con SpotlightTour (COMPLETADA)

- [x] Tour guiado por rol (Admin/Cajero/Mesero)
- [x] Mini-tours por pestaña al primera visita
- [x] Tours contextuales en formularios clave

---

## ✅ FASE 8 — Gestión Avanzada de Usuarios (COMPLETADA)

- [x] Activar/desactivar usuarios sin perder historial
- [x] Eliminar usuario permanentemente
- [x] Cuatro roles: ADMIN, CAJERO, MESERO, BARRA
- [x] Permisos delegables al cajero

---

## ✅ FASE 9 — Gestión de Contactos (COMPLETADA)

- [x] `CustomersView.jsx` con 3 tabs: Clientes, Proveedores, Empleados
- [x] Sistema de fiado/deuda para clientes con abonos parciales
- [x] Directorio de proveedores
- [x] UI responsive optimizada para móviles

---

## ✅ FASE 10 — Sistema de Deudas de Empleados (COMPLETADA — 17/04/2026)

- [x] Tablas `staff_debts` y `staff_debt_payments` en Supabase
- [x] `useDebtsStore.js` — Zustand store con CRUD completo
- [x] `DebtsPanel.jsx` — Panel con lista agrupada por empleado
- [x] `DebtModals.jsx` — AddDebtModal, DebtDetailModal, AddPaymentModal
- [x] Filtros: Todos / Pendientes / Pagadas
- [x] Conversión Bs en tiempo real
- [x] Badge de deuda en `UsersManager.jsx`
- [x] Tab "Deudas" en SettingsView (adminOnly)
- [x] UI optimizada para móviles

---

## ✅ FASE 11 — Motor de Facturación Dual y Correcciones (COMPLETADA — 18/04/2026)

Corrección integral del sistema de facturación para soportar la arquitectura dual de tiempo (sesión + seats).

### Problema raíz
Cuando una mesa tiene clientes/seats, `requestAttribution` enruta horas a `seat.timeCharges` en lugar de `session.hours_paid`. Esto causaba bugs en cascada:

### Correcciones realizadas

| Archivo | Cambio |
|---------|--------|
| `tableBillingEngine.js` | Parámetro `seats` en `calculateSessionCost`, `calculateSessionCostBreakdown`, `calculateFullTableBreakdown` para detectar `isLibre` correctamente |
| `TableCard.jsx` | Timer usa `totalHoursPaid = hours_paid + seatHours`; grandTotal incluye `seatTimeCost` |
| `TableCardInlineModals.jsx` | `seatTimeCost` pasado a TotalDetailsModal |
| `TotalDetailsModal.jsx` | Nueva sección "Horas Prepagadas" (sky-blue) para horas de seats |
| `TableQueuePanel.jsx` | grandTotal incluye seatTimeCost |
| `CashierCheckoutView.jsx` | grandTotal incluye seatTimeCost |
| `OperatorDashboardPanel.jsx` | totalUsd incluye seatTimeCost |
| `tableBillingActions.js` | Restar horas: LIFO desde seat timeCharges, luego hours_paid |
| `OpenWizardModal.jsx` | Modo libre deshabilitado; solo horas prepagadas |
| `TableCardTimerDisplay.jsx` | Eliminado texto "acumulado" |
| `useNotificationCenter.js` | Recibe `tables` para resolver nombres reales; considera seat hours |
| `DashboardView.jsx` | Pasa `tables` a useNotificationCenter |

---

## 🐛 Bugs Resueltos

| Fecha | Bug | Solución |
|-------|-----|----------|
| 02/04/2026 | Logo aplastado en ticket PDF | Cálculo dinámico de `logoH` con aspect ratio real |
| 02/04/2026 | Error 409 al sincronizar ventas | Limpiar Site Data + quitar FK constraint en `sale_items` |
| 02/04/2026 | Error 404 en RPC `process_checkout` | Función desplegada manualmente via SQL Editor |
| 17/04/2026 | 404 en tabla `staff_debts` | Migración SQL para crear tablas de deudas |
| 18/04/2026 | Timer no actualiza al agregar horas | Timer no sumaba horas de seat timeCharges |
| 18/04/2026 | Restar horas no funciona | Solo restaba de `hours_paid`, no de seat timeCharges (LIFO fix) |
| 18/04/2026 | "$X.XX acumulado" en mesas prepagadas | `isLibre` no consideraba seat hours; texto eliminado |
| 18/04/2026 | Totales inconsistentes (card vs queue vs checkout) | Faltaba `seatTimeCost` en Queue, Checkout y Dashboard |
| 18/04/2026 | Detalle de Cuenta sin horas prepagadas | Añadida sección "Horas Prepagadas" en TotalDetailsModal |
| 18/04/2026 | Notificación "Mesa? Mesa?" | `useNotificationCenter` no tenía acceso a tabla `tables` |
| 25/07/2026 | Inconsistencia en `isInSession` al cerrar caja | Se agregó guard `cajaCerrada === true` y se eliminó fallback desalineado con `useDashboardMetrics` en `DashboardView.jsx` |
| 25/07/2026 | Egresos anulados contaban en el turno | Se agregó guard `status !== 'ANULADA'` al filtro de `todayExpenses` en `useDashboardMetrics.js` |
| 25/07/2026 | Error Supabase 22P02 (`temp-...` en `table_sessions`) | Se asigna `crypto.randomUUID()` nativo al payload y estado optimista en `tableSessionActions.js` |
| 25/07/2026 | Bucle de reintento `22P02` en cola offline de mesas | Se purgan automáticamente las acciones pendientes con IDs `temp-` u homologados con error `22P02` en `tableSyncActions.js` para evitar reintentos infinitos |
| 25/07/2026 | Filtro de "Turno Actual" en Módulo de Reportes | Agregado filtro "Turno Actual" como predeterminado (`selectedRange = 'shift'`), alineando métricas en tiempo real con `activeCashSession` |
| 26/07/2026 | Reporte Cierre PDF Carta + Cálculo Horas y Piñas | Añadido generador `letterCloseGenerator.js` (PDF Letter Size con resumen de Pool: Piñas + Tiempo), botones duales (Carta / Ticket 58mm) en `ReportsView.jsx` y `CierreHistoryCard.jsx` |
| 26/07/2026 | Corrección ortográfica y layout de encabezado PDF | Actualizado "POOL LOS DIAS" -> "POOL LOS DIAZ" (con Z) y ajustado margen superior para evitar solapamiento del logo con la línea separadora |
| 26/07/2026 | Detalle completo expandido por venta en PDF Carta | Rediseñada la sección 6 del PDF Carta para mostrar bloques detallados por operación: lista de productos completa sin recortar, vendedor/mesero, mesa, desgloses de pagos, vueltos y descuentos |
| 26/07/2026 | Listado completo de artículos en Sección 5 | Actualizada la sección 5 a "RESUMEN COMPLETO DE PRODUCTOS Y ARTÍCULOS VENDIDOS", listando la totalidad de productos/servicios vendidos en el turno sin recorte ni límite de 8 ítems |
| 26/07/2026 | Separación estricta de Productos vs Servicios Pool | Implementado helper `isPoolServiceItem` con detección dual (`category === 'servicios'` + prefijos `tiempo`, `piña`, `pina`, `partida`, `compartido`, `mesa`). Corrige el conteo de la Sección 2 (Servicios Pool) y excluye los cobros de mesas de la Sección 5 (Productos Vendidos) |
| 26/07/2026 | Conteo acumulado de horas de juego en Sección 2 | Implementado helper `parseHoursFromItem` para calcular y desplegar el total exacto de tiempo jugado en horas (`hrs`) acumuladas (ej: `5.5 hrs`) en lugar del número estático de registros |
| 26/07/2026 | Persistencia de Cuadre de Caja (reconData) en Cierres | Preservado `reconData` (Declarado USD/Bs y Diferencia) al guardar el cierre en `DashboardView.jsx` y `reportsProcessor.js`, permitiendo que las reimpresiones del historial (`CierreHistoryCard.jsx`) contengan la reconciliación real declarada |
| 01/08/2026 | Fix Pestaña Cierres + Entidad CIERRE_CAJA | Auto-switch de filtro de fecha a "Este Mes" al entrar a pestaña Cierres en `ReportsView.jsx`, eliminación de la opción invalida "Turno Actual" en Cierres, y creación de entidad autónoma `tipo: 'CIERRE_CAJA'` en `DashboardView.jsx` y `reportsProcessor.js` |
| 01/08/2026 | Fix Muestreo de Restante en Pagos Mixtos (Checkout) | Corregido el cálculo de `remainingBs` y `proportionPaid` en `useCheckoutPayments.js` para usar la conversión de `effectiveRate` en lugar de `cartTotalBs` con tasa desalineada. Evita falsos disparos de "Ventas Fiadas" en pagos mixtos USD + Bs |
| 01/08/2026 | Sincronización Multi-Dispositivo con Guardarraíles | Implementada cola persistente `_pending_sale_uploads`, función `syncPendingSalesToCloud` con Safety Snapshot automático (`bodega_sales_backup_safety`) y sync bidireccional al arrancar/reconectar para garantizar paridad entre PWA, Vercel y equipos secundarios sin borrado de datos |

---

## 📌 Decisiones Técnicas Registradas

| Decisión | Razón |
|----------|-------|
| **Sin React Router** — navegación por estado `activeTab` | Compatibilidad PWA offline |
| **RLS permisivo** en todas las tablas | Offline-first; seguridad en Guards del cliente |
| **PIN hasheado SHA-256** | Web Crypto API nativa, sin dependencias |
| **Papel fijo 58mm** | Impresora térmica 58mm del cliente |
| **Moneda base USD** | Bs son conversiones dinámicas; nunca almacenadas como base |
| **Modo libre deshabilitado** | Solo horas prepagadas para evitar confusión y cobros incorrectos |
| **Arquitectura dual de tiempo** | `session.hours_paid` + `seat.timeCharges[]` permite cobro individual por cliente |
| **4 roles (ADMIN/CAJERO/MESERO/BARRA)** | BARRA agregado para operadores de barra con permisos limitados |
| **Web Serial API para impresión** | Impresión directa ESC/POS sin intermediarios |
