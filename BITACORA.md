# 📓 Bitácora de Desarrollo — Pool Los Diaz POS

> Registro cronológico de avances, bugs resueltos y decisiones técnicas.  
> Última actualización: **02 Abril 2026**

---

## 📍 ¿Dónde estamos?

**Estamos al final de FASE 0 (Infraestructura Base) y en el umbral de FASE 1 (Login con PIN).**

La base de datos, el motor de ventas y el branding están listos. Los componentes de seguridad existen en el código pero **no están integrados en `App.jsx`** todavía — esa es exactamente la tarea pendiente de Fase 1.

---

## ✅ FASE 0 — Infraestructura Base (COMPLETADA)

### Branding y Migración de Identidad
- [x] Eliminadas todas las referencias a "Listo POS" / "Listo Lite"
- [x] Rebranding global a **"Pool Los Diaz"** y "Pool Los Diaz Premium"
- [x] `vite.config.js` — nombre PWA actualizado
- [x] `TermsOverlay.jsx` — términos y condiciones actualizados
- [x] `PremiumGuard.jsx` — mensajes de licencia actualizados
- [x] `WalletView.jsx`, `SettingsView.jsx`, `DashboardView.jsx` — UI actualizada
- [x] `OnboardingOverlay` eliminado de `App.jsx`

### Motor de Ventas y Base de Datos
- [x] Función RPC `process_checkout` desplegada en Supabase (`raxcxddreghynthyvllh`)
- [x] Función RPC `validate_double_entry` desplegada
- [x] `offlineQueueService.js` — cola de emergencia operativa
- [x] `useCloudSync.js` — sincronización P2P en tiempo real operativa
- [x] Restricción FK removida en `sale_items` para compatibilidad con catálogo dinámico

### Tickets Térmicos 58mm
- [x] Logo en ticket con **aspect ratio dinámico** (sin distorsión)
- [x] `ticketGenerator.js` — ancho fijo en 58mm, variables `is80` eliminadas
- [x] `dailyCloseGenerator.js` — ancho fijo en 58mm
- [x] Opción de selección de papel 80mm **eliminada** de Settings y SettingsModal

---

## ✅ FASE 1 — Login con PIN y Roles (COMPLETADA)

### Componentes Integrados
- [x] `src/hooks/store/authStore.js` — Store de auth con `staff_users` de Supabase
- [x] `src/components/security/LoginScreen.jsx` — Pantalla y conectada a `App.jsx`
- [x] `src/components/security/PinPad.jsx` — Teclado numérico táctil
- [x] `src/components/security/Guards.jsx` — `<AdminRoute>`, `<CashierRoute>`, etc. actuando globalmente.
- [x] Migración SQL completada: tablas `staff_users` y `cash_sessions` en entorno nube.
- [x] Bloqueo efectivo del UI a operadores sin caja activa (`CashClosedLockScreen`).

---

## 🔄 FASE 2 — Plano de Mesas (EN PROGRESO)

- [ ] Migración SQL: tablas `tables` y `table_sessions`
- [ ] Implementar motor de timers y facturación de mesas
- [ ] `TablesView.jsx` — Vista del plano de mesas
- [ ] `TableCard.jsx` — Tarjeta de mesa con timer regresivo
- [ ] Motor de timers con `expires_at`
- [ ] Integración con Supabase Realtime para actualización en vivo

---

## ⏳ FASE 3 — Órdenes y Comandas (PENDIENTE)

- [ ] Migración SQL: tablas `orders`, `order_items`, `payments`
- [ ] `OrderPanel.jsx` — Panel de orden por mesa
- [ ] Integración con `checkoutProcessor.js`
- [ ] Vista del cajero con todas las órdenes abiertas

---

## ⏳ FASE 4 — Apertura y Cierre de Caja (PENDIENTE)

- [ ] Migración SQL: tabla `cash_sessions`
- [ ] Pantalla de apertura de caja
- [ ] Bloqueo de acceso si no hay caja abierta
- [ ] Arqueo físico vs sistema

---

## ⏳ FASE 5 — Inventario de Barra (PENDIENTE)

- [ ] Integración catálogo → tabla `products` en Supabase
- [ ] Descuento automático de stock en checkout
- [ ] Alertas de stock bajo
- [ ] Reporte de rotación en cierre del día

---

## 🐛 Bugs Resueltos

| Fecha | Bug | Solución |
|-------|-----|----------|
| 02/04/2026 | Logo aplastado en ticket PDF | Cálculo dinámico de `logoH` con aspect ratio real (`img.width / img.height`) |
| 02/04/2026 | Error 409 al sincronizar ventas | Productos "fantasma" en caché local del browser. Solución: limpiar Site Data + quitar FK constraint en `sale_items` |
| 02/04/2026 | Error 404 en RPC `process_checkout` | Función no existía en nuevo proyecto Supabase. Desplegada manualmente via SQL Editor |

---

## 📌 Decisiones Técnicas Registradas

| Decisión | Razón |
|----------|-------|
| **Sin React Router** — navegación por estado `activeTab` | Compatibilidad PWA offline. No se instalará `react-router-dom` salvo aprobación explícita |
| **RLS permisivo** en todas las tablas | El sistema es offline-first; la seguridad se implementa en Guards del cliente |
| **PIN hasheado SHA-256** | Nunca texto plano en BD. Se usa Web Crypto API nativa (sin dependencias externas) |
| **Papel fijo 58mm** | El cliente tiene únicamente impresora térmica de 58mm |
| **Moneda base USD** | Bs y COP son conversiones dinámicas; nunca se almacenan como base |
