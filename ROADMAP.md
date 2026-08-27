# 🎱 Pool Los Diaz — Hoja de Ruta del Sistema

> **Versión:** 2.0
> **Proyecto:** Pool Los Diaz POS
> **Supabase Ref:** `raxcxddreghynthyvllh`
> **Stack:** React 19 + Vite + Supabase + LocalForage (PWA Offline-First)
> **Hosting:** Cloudflare Workers
> **Última actualización:** 19 Agosto 2026

---

## 🎯 Visión General

Sistema de punto de venta especializado para un salón de billar, con gestión de mesas, órdenes de consumo, control de caja, inventario, contactos y reportes financieros. Diseñado para funcionar 100% offline con sincronización en la nube mediante Supabase.

---

## FASE 0 — Infraestructura Base ✅ (COMPLETADA)

**Objetivo:** Establecer la base técnica del proyecto — branding, motor de ventas, tickets y sincronización.

- [x] Branding "Pool Los Diaz" en toda la app
- [x] Motor de ventas con RPC `process_checkout`
- [x] Cola offline (`offlineQueueService.js`)
- [x] Sincronización P2P (`useCloudSync.js`)
- [x] Tickets térmicos 58mm con logo dinámico

---

## FASE 1 — Autenticación por PIN y Roles ✅ (COMPLETADA)

**Objetivo:** Control de acceso por rol con PIN de 4 dígitos.

- [x] Tabla `staff_users` en Supabase
- [x] Store de autenticación con caché offline
- [x] Hashing SHA-256 vía Web Crypto API
- [x] `LoginScreen.jsx` + `PinPad.jsx`
- [x] Guards de ruta por rol

### Roles del sistema
| Rol | Descripción | Permisos |
|-----|------------|----------|
| `ADMIN` | Dueño / Gerente | Acceso total. Configuración, reportes, caja, mesas, deudas |
| `CAJERO` | Cajero | Ventas, cobros, apertura/cierre de caja (delegable) |
| `MESERO` | Mesero / Operador | Asignar mesas, registrar órdenes, ver consumo |
| `BARRA` | Operador de barra | Preparar pedidos, ver órdenes asignadas |

---

## FASE 2 — Plano Interactivo de Mesas ✅ (COMPLETADA)

**Objetivo:** Vista principal de operación con estado en tiempo real de cada mesa.

- [x] Tablas `tables` y `table_sessions`
- [x] `TablesView.jsx` con plano visual
- [x] `TableCard.jsx` con timer regresivo y precio
- [x] Modos: Prepagado por Horas / Piña
- [x] Mesas tipo NORMAL (bar) sin cobro por tiempo
- [x] Filtros por tipo y estado
- [x] CRUD administrativo de mesas
- [x] Sincronización Supabase Realtime

---

## FASE 2.5 — Refinamiento Administrativo y UI Móvil ✅ (COMPLETADA)

- [x] CRUD de mesas (añadir/editar/cambiar nombre)
- [x] Tipos: Mesa Pool (timer) vs Mesa Normal (solo consumo)
- [x] Filtros combinados Tipo × Estado
- [x] UI optimizada para móviles (sticky filters)

---

## FASE 3 — Órdenes, Consumo y Cobro ✅ (COMPLETADA)

**Objetivo:** Vincular consumo de barra a cada mesa con checkout unificado.

- [x] Tablas `orders`, `order_items`, `payments`
- [x] `OrderPanel.jsx` — Panel de consumo por mesa
- [x] Modal "Detalle de Cuenta" con desglose dual ($/Bs)
- [x] Ticket parcial (pre-cuenta)
- [x] Flujo de cobro integrado con `checkoutProcessor.js`

---

## FASE 4 — Apertura y Cierre de Caja ✅ (COMPLETADA)

**Objetivo:** Control formal del dinero físico con arqueo y cierre de turno.

- [x] Apertura de caja con fondo inicial
- [x] Bloqueo si no hay caja abierta
- [x] Cierre ciego (arqueo sin ver totales del sistema)
- [x] Ticket térmico de cierre
- [x] Historial en Reportes

---

## FASE 5 — Inventario de Barra ✅ (COMPLETADA)

**Objetivo:** Control de stock con descuento automático al vender.

- [x] Catálogo con precios USD y conversión Bs
- [x] Lotes/bultos con precio unitario calculado
- [x] Alertas de stock bajo configurables
- [x] Escáner de código de barras
- [x] Filtros, búsqueda y paginación

---

## FASE 6 — Refactorización de Código ✅ (COMPLETADA — 05/04/2026)

**Objetivo:** Modularizar archivos >600 líneas sin romper funcionalidad.

- [x] 7 vistas refactorizadas
- [x] 7+ hooks extraídos
- [x] 5+ componentes nuevos
- [x] Build verificado green

---

## FASE 7 — Onboarding ✅ (COMPLETADA)

- [x] SpotlightTour por rol y sección
- [x] Tours contextuales en formularios

---

## FASE 8 — Gestión Avanzada de Usuarios ✅ (COMPLETADA)

- [x] Activar/desactivar/eliminar usuarios
- [x] 4 roles: ADMIN, CAJERO, MESERO, BARRA
- [x] Permisos delegables

---

## FASE 9 — Gestión de Contactos ✅ (COMPLETADA)

**Objetivo:** CRM básico con clientes, proveedores y empleados.

- [x] `CustomersView.jsx` con tabs: Clientes / Proveedores / Empleados
- [x] Sistema de fiado con abonos parciales
- [x] Directorio de proveedores
- [x] UI responsive para móviles

---

## FASE 10 — Sistema de Deudas de Empleados ✅ (COMPLETADA — 17/04/2026)

**Objetivo:** Registro y seguimiento de fiados de empleados con historial de pagos.

- [x] Tablas `staff_debts` y `staff_debt_payments`
- [x] `useDebtsStore.js` — Store Zustand
- [x] `DebtsPanel.jsx` + `DebtModals.jsx`
- [x] Filtros: Todos / Pendientes / Pagadas
- [x] Conversión Bs en tiempo real
- [x] Badge de deuda en UsersManager
- [x] Tab "Deudas" en Settings (adminOnly)

---

## FASE 11 — Motor de Facturación Dual ✅ (COMPLETADA — 18/04/2026)

**Objetivo:** Corregir el sistema de facturación para soportar la arquitectura dual de tiempo (sesión + seats).

- [x] `tableBillingEngine.js` — parámetro `seats` para detección correcta de `isLibre`
- [x] Timer countdown usa `totalHoursPaid = hours_paid + seatHours`
- [x] grandTotal incluye `seatTimeCost` en todas las vistas (Card, Queue, Checkout, Dashboard)
- [x] TotalDetailsModal con sección "Horas Prepagadas"
- [x] Restar horas: LIFO desde seat timeCharges, luego hours_paid
- [x] Modo libre deshabilitado; solo horas prepagadas
- [x] Notificaciones con nombres reales de mesas
- [x] Texto "acumulado" eliminado

---

## AUDITORÍA DE BASE DE DATOS — 18 AGOSTO 2026

### Método y alcance

Se ejecutó una auditoría remota **de solo lectura** contra el proyecto Supabase configurado en `.env`, usando únicamente la clave pública anon. No se ejecutaron `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP` ni RPCs con capacidad de mutación.

También se añadió `db_audit_module_1.sql`, que contiene las consultas que deben ejecutarse desde Supabase SQL Editor con una cuenta administradora para confirmar RLS, políticas, propietarios de funciones, Realtime, constraints e invariantes de datos.

### Hallazgos remotos confirmados

- Los endpoints REST de las tablas críticas existen y responden.
- Los endpoints OPTIONS de `process_checkout`, `validate_double_entry`, `register_and_check_device`, `activate_demo_secure`, `heartbeat_device` y `auto_register_device` existen.
- El endpoint OpenAPI no está expuesto para la clave anon; por eso las políticas y definiciones exactas de funciones deben confirmarse con `db_audit_module_1.sql`.
- La clave anon pudo leer al menos una fila de `staff_users`, `orders`, `order_items` y `pool_config`.
- La respuesta de `staff_users` expone la columna `pin_hash` al rol anon. Esto es un hallazgo **P0** aunque el valor no se haya mostrado en la auditoría.
- `cloud_backups` no tiene la columna `id` que declara `db_estacion_maestra_setup.sql`.
- `account_devices` no tiene `user_id`, aunque `fix_rls_policies.sql` intenta usarlo en una política.
- `table_sessions` no tiene `paid_at`; el frontend lo trata como estado local, pero debe quedar documentado y no confundirse con una columna remota.
- `products` solamente mostró `id`, `name` y `stock` entre las columnas esperadas; no están `price_usd`, `price_usdt`, `price_bs`, `cost_usd`, `cost_bs`, `active` ni `user_id`.
- `sales` tiene `total`, pero no `user_id`, `total_usd` ni `total_bs`.
- `sale_items` tiene `quantity` y `unit_price`, pero no `unit_price_usd` ni `unit_price_bs`.
- `payments` tiene `amount_usd` y `amount_bs`, pero no `sale_id`, `amount` ni `currency`.
- `pool_customers` no tiene `favor` ni `user_id`.

### Confirmación administrativa y conexión

La imagen del Dashboard y el token son correctos. La Management API respondió `200` para el proyecto `raxcxddreghynthyvllh` (`pool bar`, región `us-west-2`, Postgres `17.6`). El diagnóstico anterior que atribuía el fallo al token fue incorrecto.

El problema real es la cadena `SUPABASE_DB_URL`: aunque el host pooler ya fue cambiado a `aws-0-us-west-2.pooler.supabase.com`, la conexión sigue devolviendo `tenant/user postgres.raxcxddreghynthyvllh not found`. La conexión directa derivada del mismo proyecto sí pasó una consulta de solo lectura con `db.raxcxddreghynthyvllh.supabase.co:5432`, usuario `postgres`. No se usó esa conexión para mutar datos ni se ejecutó ninguna migración.

Para futuras auditorías automáticas, `.env` debe usar la cadena exacta copiada desde **Connect → Direct connection** o una cadena pooler que Supabase acepte literalmente; no se debe inferir el usuario del pooler a partir de la región. La contraseña no se registra en este documento.

### Auditoría administrativa confirmada — solo lectura

La consulta directa con privilegios de base de datos confirmó lo siguiente:

- Las **21/21 tablas** esperadas existen.
- RLS está habilitado en 19 tablas; está deshabilitado en `staff_users` y `pool_config`.
- `staff_users` tiene 14 filas y todos los `pin_hash` tienen forma SHA-256 de 64 caracteres, pero la tabla no tiene RLS efectivo.
- `orders` tiene 728 filas, `order_items` 964, `account_devices` 31, `sync_documents` 1.727 y `pool_config` una fila global.
- Había **2 órdenes OPEN huérfanas**; fueron canceladas de forma reversible después de conservar snapshot y artículos.
- No hay más de una caja `OPEN` por usuario en la comprobación ejecutada.
- Realtime publica únicamente `cash_sessions`, `pool_config`, `table_sessions` y `tables` entre las tablas auditadas.

### Hallazgos de seguridad bloqueantes confirmados

- La clave `anon` puede leer `staff_users.id,pin_hash`; esto confirma el **P0** de exposición de PIN.
- La política `Allow orders management` permite `ALL` a `anon` y `authenticated` con `USING (true)` y `WITH CHECK (true)`.
- La política `Allow order items management` permite `ALL` a `anon` y `authenticated` con `USING (true)` y `WITH CHECK (true)`.
- `pool_customers` permite `ALL` a `anon` con expresiones `true`.
- `products`, `sales`, `sale_items` y `payments` solo comprueban `auth.role() = 'authenticated'`; no garantizan tenant y varias de esas tablas no tienen `user_id`.
- `pool_config` tiene una sola fila global y RLS deshabilitado; no es aislamiento por cuenta.
- Los RPC `process_checkout(jsonb)`, `validate_double_entry(uuid)` y `register_and_check_device(text,text,text)` tienen `EXECUTE` para `anon` y `authenticated`. Solo `register_and_check_device` es `SECURITY DEFINER`; no declara `search_path` explícito y debe endurecerse antes de confiar en él.
- No se encontraron en `public.pg_proc` `activate_demo_secure`, `heartbeat_device` ni `auto_register_device`; los endpoints históricos no sustituyen la verificación de funciones reales.

### Drift de esquema confirmado por PostgreSQL

- `account_devices.user_id` no existe; la política actual depende de email del JWT.
- `cloud_backups.id` no existe; su clave primaria es `email`.
- `table_sessions.paid_at` no existe.
- `products` usa `price` y `cost_price`; no tiene `price_usd`, `price_usdt`, `price_bs`, `cost_usd`, `cost_bs`, `active` ni `user_id`.
- `sales` usa `total`; no tiene `user_id`, `total_usd` ni `total_bs`.
- `sale_items` usa `quantity`, `unit_price` y `subtotal`; no tiene `unit_price_usd` ni `unit_price_bs`.
- `payments` usa `order_id`, `amount_usd` y `amount_bs`; no tiene `sale_id`, `amount` ni `currency`.
- `pool_customers` no tiene `favor` ni `user_id`.
- `orders`, `cash_sessions`, `tables`, `table_sessions`, `staff_users`, `staff_debts` y `sync_documents` sí tienen `user_id`, pero varios son anulables; antes de reforzar RLS hay que medir y resolver los registros sin propietario.

### Consecuencia para el Módulo 1

El Módulo 1 estaba **abierto y bloqueado** antes de aplicar cambios. El orden ejecutado fue: snapshot privado verificable → preflight transaccional con `ROLLBACK` → migración idempotente → pruebas anon/authenticated/cuenta A/cuenta B → verificación de RPCs y Realtime.

### Resultado de ejecución — 19 agosto 2026

- `module1_identity_security_migration.sql` fue aplicado automáticamente mediante la Management API del proyecto correcto.
- Antes de confirmar se ejecutó el mismo SQL en una transacción de prueba con `ROLLBACK`; pasó sin errores.
- Se crearon 20 snapshots privados en `module1_internal.pre_module1_*`; no se borraron filas. Las 728 órdenes del snapshot siguen presentes; hoy existen 729 por 1 orden posterior. Las 2 órdenes `OPEN` huérfanas se corrigieron a `CANCELLED` con log, hashes pre/post y rollback fail-closed; el runner es idempotente y no repite la escritura.
- `staff_users`, `orders`, `order_items`, `pool_customers`, `products`, `sales`, `sale_items`, `payments`, `pool_config`, `cash_sessions`, `sync_documents`, `account_devices` y `cloud_backups` ya no aceptan consultas anónimas; la prueba REST con anon devolvió rechazo en todas.
- Los RPC críticos ya no conceden `EXECUTE` a `anon`; los `SECURITY DEFINER` tienen `search_path` seguro.
- Se verificó aislamiento con dos cuentas existentes simuladas mediante JWT claims: cada cuenta ve sus propios operadores, órdenes, mesas, configuración, dispositivos, backups y documentos; no ve los de la otra.
- Se agregó una constraint `NOT VALID` sobre `sales.user_id`: las 1.682 ventas históricas sin propietario quedan bloqueadas por RLS y no se inventó una cuenta propietaria. Las ventas nuevas deben llevar `user_id`.
- El frontend fue ajustado para enviar `user_id` en backups y para no abrir listeners ni consultas Realtime sin cuenta cloud.
- `module1_orphan_orders_repair.sql` canceló las 2 órdenes huérfanas antiguas sin eliminar órdenes ni artículos; `module1_orphan_orders_rollback.sql` fue probado transaccionalmente.
- La cadena pooler actual de `SUPABASE_DB_URL` continúa siendo inválida (`tenant/user not found`); la conexión Direct derivada fue validada en solo lectura, pero el archivo `.env` aún requiere usar la cadena Direct exacta. Las operaciones se realizaron por Management API sin imprimir secretos.

### Interpretación

Hay tablas legacy o auxiliares que el frontend actual no usa como fuente principal, porque productos, clientes y ventas se manejan principalmente mediante arrays locales y `sync_documents`. `sales` contiene 1.682 filas históricas sin propietario y queda clasificada como **legacy bloqueada**: no se reasigna automáticamente porque existen dos cuentas con datos y el esquema no permite determinar a cuál pertenece cada venta. La migración del historial de ventas requiere un módulo propio con reglas de negocio, no una suposición de seguridad.

Cada tabla debe permanecer clasificada como **canónica**, **compatibilidad**, **legacy bloqueada** o **pendiente de migración**.

El mayor riesgo actual no es solamente el drift de columnas, sino que los datos de negocio están accesibles con la clave anon. El frontend no puede considerarse una barrera de seguridad hasta que las políticas reales de producción sean revisadas y probadas con dos cuentas distintas.

---

## FASE 12 — MÓDULO 1: IDENTIDAD, TENANT Y CONTROL DE ACCESO ✅ (CERRADO EN EL ALCANCE APROBADO — 19 AGOSTO 2026)

### Objetivo

Establecer una frontera única y verificable para identidad, cuenta, permisos, dispositivos y acceso a datos. Ningún módulo posterior puede comenzar hasta cerrar este módulo y validar sus integraciones.

### Alcance incluido

1. Unificar `authStore.js` y `useAuthStore.js` en una sola fuente de sesión operativa.
2. Definir un `TenantContext`/contrato único con `authUserId`, `accountId`, `accountEmail`, operador, rol y permisos.
3. Eliminar el acceso administrativo maestro hardcodeado del frontend.
4. Corregir el flujo de licencia y dispositivo para que `license_inactive`, `license_expired` y `limit_reached` sean estados bloqueantes reales.
5. Retirar o aislar las referencias legacy a `licenses`, `heartbeat_device` y `auto_register_device`.
6. Clasificar y corregir las políticas RLS de tablas críticas.
7. Agregar aislamiento a `account_devices` sin romper los dispositivos existentes.
8. Impedir lectura anónima de `staff_users.pin_hash` y de datos de negocio.
9. Corregir el scope de canales Realtime usando el tenant/usuario real.
10. Documentar las tablas legacy detectadas y prohibir que nuevos flujos dependan de ellas.

### Fuera de alcance

- No rediseñar todavía el checkout.
- No cambiar el motor de inventario.
- No migrar aún ventas locales a un ledger nuevo.
- No cambiar la UI salvo lo necesario para reflejar estados de acceso correctos.
- No borrar tablas legacy en esta fase.

### Guardarraíles obligatorios

- Crear backup verificable antes de cualquier migración de producción.
- Ejecutar primero consultas de auditoría; no aplicar `ALTER TABLE` basado solamente en el código.
- No usar `DROP`, `TRUNCATE` ni borrado de datos para resolver drift.
- Toda migración debe ser idempotente y tener una estrategia de rollback.
- No modificar políticas globalmente sin probar primero una cuenta propietaria, otra cuenta distinta, operador no admin y rol anon.
- Nunca exponer valores de `pin_hash`, tokens, backups ni datos de otras cuentas en logs o pruebas.
- Mantener una lista de cambios de esquema aplicada y su fecha.
- No pasar al módulo 2 mientras quede un hallazgo P0 abierto.
- Cada cambio de frontend debe conservar temporalmente los contratos necesarios para no romper el flujo de login existente.

### Plan de ejecución

#### M1.1 — Verdad del esquema remoto

- Ejecutar `db_audit_module_1.sql` en SQL Editor.
- Guardar el resultado de tablas, columnas, RLS, políticas, funciones, publicación Realtime, índices y constraints.
- Clasificar cada tabla como canónica, compatibilidad, legacy o pendiente.
- Confirmar firmas y propietarios de los RPCs.

#### M1.2 — Aislamiento de base de datos

- Diseñar políticas por `auth.uid()`/tenant.
- Revisar primero `staff_users`, `sync_documents`, `cloud_backups`, `cloud_licenses`, `account_devices`, `cash_sessions`, `tables`, `table_sessions`, `orders`, `order_items` y `pool_config`.
- Crear índices y constraints solamente después de verificar datos existentes.
- Verificar que datos sin `user_id` tengan una migración segura o queden bloqueados para nuevas escrituras.

#### M1.3 — Contrato único de identidad en frontend

- Hacer que todos los módulos consuman la misma sesión.
- Eliminar lecturas de `cloudSession` desde stores que nunca lo contienen.
- Generar nombres de canales Realtime con el tenant correcto.
- Centralizar permisos y estados de licencia.

#### M1.4 — Validación completa del acceso

- Login correcto.
- Login con PIN incorrecto y lockout.
- Operador activo/inactivo.
- Rol autorizado/no autorizado.
- Licencia activa, vencida y suspendida.
- Límite de dispositivos alcanzado.
- Cambio de cuenta en el mismo navegador.
- Sesión offline con caché válida.
- Logout y limpieza de sesión.

### Tests completos del módulo

#### Tests de base de datos

- Rol anon no puede leer `staff_users.pin_hash`.
- Cuenta A no puede leer ni modificar filas de cuenta B.
- Operador no admin no puede modificar licencia, dispositivos ni políticas.
- `sync_documents` solo devuelve documentos del `auth.uid()` correspondiente.
- `cloud_backups` solo devuelve el backup del propietario.
- `account_devices` no permite registrar dispositivos bajo otra cuenta.
- `cash_sessions`, `tables`, `table_sessions`, `orders` y `pool_config` quedan aislados por cuenta.
- Las funciones SECURITY DEFINER tienen propietario controlado y `search_path` seguro.
- No existen dos cajas `OPEN` para la misma cuenta.
- No quedan órdenes `OPEN` huérfanas.
- Los canales Realtime de cuentas distintas no reciben eventos cruzados.

#### Tests de aplicación

- La app nunca otorga `ADMIN` por una constante local.
- Un `limit_reached` bloquea tanto el login inicial como la recarga de la app.
- Un error de validación de licencia no se convierte en acceso permitido.
- El cambio de cuenta no reutiliza catálogo, permisos ni preferencias de la cuenta anterior.
- El login offline solo funciona con caché vinculada a la cuenta correcta.
- Todos los stores reciben el mismo `authUserId` y `accountId`.
- Logout destruye sesión local, listeners y canales Realtime.

#### Tests de regresión e integración

- Login → PIN → apertura de caja → navegación por módulos.
- Login → venta básica → reportes.
- Login → mesa → orden → checkout.
- Login de dos cuentas en dos dispositivos simulados.
- Cambio de sesión mientras existen listeners Realtime activos.
- Reconexión después de perder internet durante el login.
- `bunx eslint` sin errores en los archivos modificados y, como condición de cierre técnico global, sin errores preexistentes del repositorio.
- `bun module1_identity_security_test.mjs` devuelve `PASS` sin mutaciones; usa dos cuentas existentes simuladas y prueba también el rechazo de anon.

### Criterio de cierre del Módulo 1

El módulo queda cerrado únicamente cuando:

- el SQL de auditoría fue ejecutado y sus resultados están documentados;
- no existen exposiciones anónimas de datos de negocio;
- RLS y políticas fueron probadas con dos cuentas reales o fixtures equivalentes;
- no existe bypass administrativo en el frontend;
- todos los estados de licencia son bloqueantes cuando corresponde;
- los canales Realtime están aislados;
- los tests del módulo y los flujos de integración pasan;
- no quedan errores de lint relacionados con este módulo;
- el flujo completo de autenticación continúa funcionando online y offline.

**Estado:** ✅ la frontera de seguridad del Módulo 1 está aplicada y verificada; las órdenes huérfanas fueron corregidas de forma reversible, el runner de reparación es idempotente y el flujo operativo completo pasó E2E dentro de este mismo proyecto. El lint global mantiene 0 errores y 284 warnings pendientes de refactor. El historial `sales` permanece legacy bloqueado por diseño y pertenece al Módulo 2. La prueba offline/reconexión integral queda como hardening posterior; no se usó para declarar acceso permitido ni se dejó ningún fixture persistente.

---

## FASE 13 — ASIGNACIÓN AUDITABLE DE VENTAS LEGACY 🟡 (APLICACIÓN PARCIAL; AMBIGUOS BLOQUEADOS)

### Auditoría de trazabilidad — 19 agosto 2026

- `public.sales`: **1.682** ventas, todas con `user_id IS NULL`.
- `sync_documents.collection = 'sale'`: 1.699 documentos.
- Coincidencia exacta por `doc_id` o `data.payload.id`: 1.220 ventas únicas.
- Propuestas con un único propietario `auth.users.id`: **1.134**.
- Conflictos entre propietarios: **86 ventas** (172 candidatos, dos cuentas mezcladas).
- Sin evidencia suficiente: **462 ventas**.
- Propietarios inválidos: **0**.

### Artefactos creados y snapshot privado remoto

- `legacy_sales_assignment_migration.sql`: snapshot privado, candidatos y clasificación; no modifica `public.sales`.
- `legacy_sales_assignment_apply.sql`: aplica únicamente decisiones `APPROVE` explícitas y verifica el snapshot antes de cada escritura.
- `legacy_sales_assignment_rollback.sql`: revierte solo las filas registradas por `apply_log` y aborta si fueron alteradas posteriormente.
- `scripts/test-legacy-sales-assignment.mjs`: prueba remota read-only y validación estática.
- `legacy_sales_approval_queue.sql`: cola privada, ledger de propuestas y trigger append-only.
- `scripts/prepare-legacy-sales-approvals.mjs`: preparación idempotente y fail-closed sin writes de negocio.
- `scripts/manage-legacy-sales-approvals.mjs`: revisión individual, aplicación explícita y rollback con confirmaciones exactas.
- `scripts/test-legacy-sales-approvals.mjs`: invariantes remotas de cola, ledger y `public.sales`.
- Ledger privado creado en `module2_internal` con run `61e0ba0f…`: snapshot 1.682/1.682, cola 1.134/1.134 y aplicación parcial posterior de 1.134 asignaciones exactas. No es staging de aplicación; son artefactos de auditoría dentro del proyecto actual.

### Guardarraíles y regla de aplicación

- No se asignan propietarios por fecha, cantidad, licencia o intuición.
- Las 1.134 propuestas únicas son candidatas, no decisiones aprobadas.
- Las 86 conflictivas y 462 unresolved quedan en HOLD implícito y fuera de RLS hasta una revisión adicional.
- La aplicación exige `app.legacy_sales_run_id`, decisión `APPROVE`, `assigned_user_id`, motivo, aprobador y timestamp.
- La migración conserva la fila, items, pagos, timestamps y asientos; solo cambia `sales.user_id` cuando existe aprobación verificable.

**Estado verificado:** las 1.134 coincidencias únicas exactas fueron aplicadas con snapshot, ledger, motivo, aprobador y `apply_log`; quedan 548 ventas sin propietario (86 conflictos y 462 sin evidencia), bloqueadas. El rollback sigue disponible y protegido contra cambios posteriores. No se aplican inferencias adicionales.

---

## FASE 14 — PRUEBA E2E DEL FLUJO OPERATIVO ✅ (EJECUTADA EN EL PROYECTO ACTUAL — 19 AGOSTO 2026)

Se mantuvo `scripts/test-e2e-flow.mjs` con `playwright-core` y se agregó `scripts/run-module1-e2e-current-project.mjs`. El runner automático obtiene temporalmente la `service_role` mediante la Management API, crea una cuenta Auth y fixtures con prefijo `_M1E2E_`, ejecuta el navegador y elimina todo al finalizar, incluso cuando el test falla. No escribe credenciales en `.env` ni usa cuentas reales.

El flujo validado fue:

```text
login cloud → operador por PIN → apertura de caja → mesa → consumo → cobro
→ liberar mesa → cierre de caja → logout cloud
```

Resultado confirmado: `PASS`. La cuenta, operador, producto, mesa, licencia, caja, orden, artículos, pagos, venta y documentos temporales quedaron eliminados; la verificación posterior no encontró usuarios ni fixtures `_M1E2E_` remanentes. El runner usa Node para compatibilidad con el canal de debugging de Chromium y puede iniciar/detener Vite automáticamente.

`test:e2e` sigue disponible para una cuenta manual dedicada mediante `.env`; si sus cinco variables no existen se mantiene en `SKIP` de forma segura. El criterio de cierre automatizado del Módulo 1 es `bun run test:module1-e2e-current`.

---

## FASE 15 — RECONCILIACIÓN DEL BACKUP LOCAL 🟢 (SNAPSHOT Y LEDGER COMMITTEADOS)

Se ejecutó `bun run reconcile:backup` usando el archivo local `backup_pool_los_diaz_2026-08-19.json` con SHA-256 `180cb62f…4d1f6`. El runner consulta `sync_documents` en modo lectura, guarda solo hashes del backup local y conserva un snapshot privado de los payloads cloud necesarios para auditar el resultado. El snapshot es histórico e inmutable: las pruebas posteriores exigen que sus filas y propietarios sigan presentes, pero reportan por separado las modificaciones cloud posteriores sin revertirlas automáticamente.

### Resultado del run `03a46ef8…`

| Clasificación | Cantidad | Acción segura |
|---|---:|---|
| Coincidencia exacta con un único documento cloud | 1.466 | `NOOP_EXACT`; ya estaban iguales |
| Documento cloud único diferente | 0 | No aplica |
| Id local con documentos cloud duplicados | 86 | `HOLD_AMBIGUOUS`; no se elige propietario |
| Id del backup ausente en cloud | 0 | No aplica |
| Documentos cloud sin equivalente local | 61 | `PRESERVE_CLOUD`; no se sobrescriben |

En el momento del snapshot la nube tenía 1.699 documentos `sale` y 1.613 ids únicos. La auditoría actual conserva las 1.699 filas y propietarios del snapshot, y encuentra 1.702 documentos/1.616 ids en cloud: son 3 documentos y 3 ids creados después del run. También se detectan 161 payloads de filas históricas modificados después del snapshot, principalmente metadatos de cierre y numeración; quedan reportados como `PASS_WITH_POST_RUN_CLOUD_CHANGES`, no se sobrescriben ni se revierten. Los 86 ids ambiguos tienen dos documentos con propietarios distintos y diferencias en los campos de cierre (`cajaCerrada`/`cierreId`); se preservaron ambos. El backup es anterior al estado cloud y no es válido para borrar los 61 documentos adicionales.

**Cambios de negocio aplicados: 0.** Esto es el resultado correcto y fail-closed: los 1.466 exactos no requieren escritura; los duplicados y cualquier futura diferencia quedan retenidos hasta una decisión empresarial explícita. No se ejecutó ningún `INSERT`, `UPDATE` ni `DELETE` sobre `public.sync_documents`, `public.sales` o tablas de negocio.

Artefactos:

- `backup_reconciliation_migration.sql`: tablas privadas de snapshot y ledger.
- `backup_reconciliation_rollback.sql`: elimina únicamente artefactos privados del run indicado y se niega si el run declara cambios de negocio.
- `scripts/reconcile-backup-sales.mjs`: comparación, snapshot, ledger e invariantes.
- `scripts/test-backup-reconciliation.mjs`: prueba remota read-only.
- Rollback check transaccional: ✅ se simuló la eliminación del run dentro de `BEGIN/ROLLBACK`; el snapshot quedó intacto.

### Cola de revisión de conflictos

Se preparó automáticamente una cola privada para los 86 IDs duplicados:

- 172 candidatos cloud preservados;
- los 86 conflictos tienen exactamente un candidato cuyo payload coincide con el backup;
- las 86 propuestas pertenecen a un único propietario cloud, sin publicar su identidad en logs;
- 86 decisiones fueron cerradas como `HOLD` + `KEEP_BOTH_DUPLICATE`;
- 0 decisiones `PENDING`;
- 0 aprobaciones destructivas;
- ningún documento fue eliminado ni modificado.

Se aplicó la política elegida: conservar ambos documentos cloud y cerrar cada caso como duplicado. La coincidencia exacta con el backup queda registrada como evidencia y propuesta, pero no se usa para borrar el candidato alternativo.

Artefactos adicionales:

- `backup_conflict_review_migration.sql`;
- `backup_conflict_review_resolution_migration.sql`;
- `scripts/prepare-backup-conflict-review.mjs`;
- `scripts/close-backup-conflicts-keep-both.mjs`;
- `scripts/test-backup-conflict-review.mjs`.

---

## FASE 16 — INTEGRIDAD DE CHECKOUT, CAJA E IDEMPOTENCIA ✅ (CERRADA — 25 AGOSTO 2026)

Se incorporó idempotencia server-side al RPC `process_checkout` mediante `module4_internal.checkout_idempotency`, con clave por cuenta, hash del payload sin la clave y serialización transaccional por `pg_advisory_xact_lock`. Un replay devuelve el mismo `sale_id`; reutilizar la clave con otro payload se rechaza. El ledger no permite escritura directa de `authenticated` y el RPC conserva acceso únicamente para `authenticated`/`service_role`, nunca `anon`.

También se añadieron validaciones server-side de carrito, pagos, fiado y balance total, y el checkout local conserva la misma `idempotency_key` en la cola offline. La migración fue probada primero con `ROLLBACK` y luego aplicada mediante `scripts/apply-module4-checkout-idempotency.mjs`; ambos pasos confirmaron cero cambios en ventas/asientos existentes.

Pruebas: checkout de pagos 13/13, flujo operativo con rollback, build y lint global sin errores.

## FASE 17 — BACKUP POSTGRESQL Y RECUPERACIÓN 🔴 (BLOQUEADA POR ENTORNO)

La reconciliación JSON y el snapshot privado ya están cerrados, pero un dump/restore PostgreSQL todavía no puede ejecutarse desde este entorno: `pg_dump`, `pg_restore` y `psql` no están instalados, y `SUPABASE_DB_URL` usa un pooler cuya identidad `postgres.raxcxddreghynthyvllh` ya fue rechazada por Supabase (`tenant/user not found`).

Guardarraíl: no se simula un backup ni se intenta restaurar sobre producción. El runner `scripts/test-module5-backup-readiness.mjs` reporta `BLOCKED_CONFIGURATION` y cero operaciones destructivas. Para cerrar esta fase falta instalar las herramientas cliente y configurar la cadena **Direct connection** exacta copiada desde Supabase Connect; luego ejecutar dump, restore aislado y verificación de conteos/hashes.

## FASE 18 — CALIDAD GLOBAL Y REDUCCIÓN DE WARNINGS 🟡 (SIN ERRORES; HARDENING PENDIENTE)

`bun run lint` devuelve 0 errores y 284 warnings. Los warnings restantes incluyen variables sin uso y reglas de React Hooks/pureza; no se eliminarán mecánicamente porque algunos requieren refactor funcional y pruebas UI. El build debe repetirse en un entorno con tiempo suficiente; la validación estática y el test de integridad futura pasan. La reducción debe hacerse por módulo, conservando el criterio de regresión después de cada grupo.

### Integridad de registros futuros — 26 agosto 2026

- Las aperturas nuevas de mesa, mesa administrativa y caja ahora fallan explícitamente si no existe una sesión cloud autenticada; no se crean filas locales que luego intenten persistirse sin `user_id`.
- La cola offline conserva el `idempotency_key` y permanece aislada por cuenta.
- `process_checkout` exige clave de idempotencia, valida carrito/pagos/fiado y rechaza reintentos con payload diferente.
- Se agregó `scripts/test-future-integrity.mjs` y `test:future-integrity`: 8 guardarraíles verificados.
- El historial ambiguo no fue eliminado ni reasignado adicionalmente.

### E2E offline/reconexión — 26 agosto 2026

- El runner E2E ahora simula pérdida de red y recuperación con Playwright antes del checkout.
- Después del logout comprueba que no queden acciones de mesa pendientes en la cola global.
- El runner es seguro y termina en `SKIP` si no existen credenciales dedicadas; no usa cuentas reales por defecto.
- Para ejecutar la prueba real faltan configurar `E2E_CLOUD_EMAIL`, `E2E_CLOUD_PASSWORD`, `E2E_STAFF_PIN`, `E2E_TABLE_NAME` y `E2E_PRODUCT_NAME` en el entorno local, además de un navegador Chromium/Chrome disponible.
- No se crea staging: la prueba usa el proyecto actual y, cuando se ejecuta con el runner efímero, limpia sus fixtures al finalizar.

## ESTADO TÉCNICO DE LINT Y BUILD — 19 AGOSTO 2026

- `bun run lint`: ✅ **0 errores**, 284 warnings pendientes de refactor; el criterio de errores bloqueantes queda cumplido.
- `bun run build`: ✅ producción compilada correctamente.
- `bun run test:legacy-assignment`: ✅ conteos verificados; 1.134 asignaciones únicas aplicadas con rollback disponible y 548 ventas ambiguas/sin evidencia bloqueadas.
- `bun module1_identity_security_test.mjs`: ✅ RLS, aislamiento, RPCs, snapshots, Realtime y anon verificados.
- `bun run test:module1-orphans`: ✅ 0 huérfanas, 2 reparaciones activas verificadas por hash, 728 órdenes del snapshot presentes, 1 orden posterior reportada y rollback transaccional probado.
- `bun run test:module1-flow`: ✅ caja existente → mesa → orden → artículo → pago → checkout, todo dentro de ROLLBACK y 0 cambios persistentes.
- `bun run repair:module1-orphans`: ✅ `PASS_IDEMPOTENT`; no realizó cambios porque las 2 reparaciones ya estaban aplicadas y verificadas.
- `bun run test:backup-reconciliation`: ✅ snapshot 1.699/1.699, manifest 1.552/1.552, propietarios preservados, cloud actual 1.702/1.616, 3 documentos posteriores y 161 payloads modificados reportados; 0 cambios de negocio.
- `bun run test:backup-conflicts`: ✅ 172 candidatos, 86 propuestas exactas, 86 resoluciones `KEEP_BOTH_DUPLICATE`, snapshot preservado y delta posterior reportada; 0 cambios de negocio.
- `bun run test:module1-e2e-current`: ✅ E2E real en el proyecto actual; cuenta y fixtures efímeros eliminados y verificados.
- `bun run module4:dry-run`: ✅ idempotencia, rechazo de payload alterado y rollback transaccional.
- `bun run module4:commit`: ✅ RPC y ledger de idempotencia aplicados; 0 ventas/asientos históricos modificados.
- `bun run test:module5-readiness`: ⚠️ `BLOCKED_CONFIGURATION`; faltan herramientas PostgreSQL y URL Direct válida.
- `bun run test:e2e`: ⏭️ runner manual omitido si no se configuran credenciales dedicadas; no afecta el PASS del runner automático.

---

## REGLA GENERAL DE AVANCE ENTRE MÓDULOS

Cada módulo debe cerrarse con este ciclo:

```text
Auditoría → alcance cerrado → guardarraíles → implementación → tests unitarios
→ tests de integración → prueba de regresión → documentación → aprobación de salida
```

El siguiente módulo solamente puede comenzar cuando el anterior y sus flujos de integración estén verificados. No se aceptarán fixes aislados que dejen un módulo parcialmente corregido.

---

## 🏗️ Arquitectura Técnica

```
┌─────────────────────────────────────────────┐
│               Pool Los Diaz PWA              │
├─────────────────┬───────────────────────────┤
│   Capa de UI    │  React 19 + Tailwind CSS  │
├─────────────────┼───────────────────────────┤
│ Estado / Lógica │  Zustand + React Hooks    │
├─────────────────┼───────────────────────────┤
│  Persistencia   │  LocalForage (IndexedDB)  │
│  Local          │  Offline-First            │
├─────────────────┼───────────────────────────┤
│  Sincronización │  useCloudSync.js (P2P)    │
│  en Tiempo Real │  Supabase Realtime        │
├─────────────────┼───────────────────────────┤
│  Base de Datos  │  Supabase PostgreSQL      │
│  Remota         │  RPCs transaccionales     │
├─────────────────┼───────────────────────────┤
│  Impresión      │  Web Serial API + ESC/POS │
│                 │  jsPDF (tickets PDF)       │
├─────────────────┼───────────────────────────┤
│  Hosting        │  Cloudflare Workers       │
└─────────────────┴───────────────────────────┘
```

---

## 📐 Reglas Inamovibles del Sistema

1. **Offline-First**: Toda acción funciona sin internet. La sincronización es eventual.
2. **PIN Hasheado**: SHA-256 vía Web Crypto API. Nunca texto plano.
3. **Doble Partida**: Cada venta genera débito/crédito para integridad contable.
4. **Impresora 58mm**: Documentos optimizados para papel térmico 58mm.
5. **Moneda base USD**: Bs son conversiones dinámicas vía tasa BCV.
6. **RLS por cuenta obligatorio**: Los Guards del cliente mejoran la UX, pero nunca sustituyen las políticas RLS por tenant.
7. **Solo horas prepagadas**: Modo libre deshabilitado temporalmente.

---

## 🔧 Estado Actual del Proyecto (Abril 2026)

| Tema | Estado |
|-----------|--------|
| Branding "Pool Los Diaz" | ✅ Completo |
| Motor de ventas | ✅ Operativo |
| Cola offline | ✅ Operativa |
| Sincronización P2P | ✅ Operativa |
| RPCs Supabase | ✅ Desplegadas |
| Tickets térmicos 58mm | ✅ Calibrado |
| Impresión Web Serial | ✅ Operativa |
| Login por PIN (4 roles) | ✅ Completo |
| Plano de Mesas con Timers | ✅ Completo |
| Órdenes y Comandas | ✅ Completo |
| Apertura / Cierre de Caja | ✅ Completo |
| Inventario de Barra | ✅ Completo |
| Refactorización de Código | ✅ Completo |
| Onboarding Tours | ✅ Completo |
| Gestión de Usuarios | ✅ Completo |
| Gestión de Contactos | ✅ Completo |
| Deudas de Empleados | ✅ Completo |
| Motor de Facturación Dual | ✅ Completo |
| Liquidación dual de precios Bs (checkout + cobro mesa) | ✅ Completo (test:dual-price-settlement) |
| Auditoría E2E del flujo de ventas (apertura→mesa→cobro→cierre) | ✅ Completo (test:sales-flow-e2e, 61 invariantes) |
| PDV compacto que aprovecha el espacio (port PLAN-CAJA-ESPACIO) | ✅ Fases 1-4 (rollback: `bun run restore:caja-espacio`) |
| Centro de Notificaciones | ✅ Completo |

### Correcciones de la auditoría E2E del flujo de ventas (2026-08-27)

1. **Vuelto en Bs inflaba reportes**: `getSaleBs` contaba el Bs recibido bruto sin restar el cambio entregado (pagar Bs 600 por una venta de Bs 500 reportaba Bs 600 de ingreso). Ahora reporta neto de `changeBs`.
2. **Descuento Bs con precio dual**: el descuento se convertía a tasa BCV mientras el subtotal usaba la tasa implícita dual. Ahora es proporcional al subtotal Bs (idéntico al comportamiento histórico cuando no hay precios duales).
3. **Cierre fantasma**: confirmar el cierre sin caja abierta creaba un registro `CIERRE_CAJA` y mostraba "completado" sin cerrar nada. Bloqueado con aviso claro.
4. **Cobro de mesa invisible en el arqueo** (`CashierPaymentModal`, ruta legada): usaba methodIds no canónicos (`EFECTIVO`/`PUNTO`/`PAGO MOVIL`), `currency: 'VES'` sin `amountBs` → los cobros no caían en `efectivo_bs`/`efectivo_usd` del arqueo. Migrado a methodIds canónicos.
5. **Fiado desde mesa no registraba deuda**: el modal legado enviaba el total como pago `FIADO` (venta "pagada", deuda $0). Ahora el fiado deja el saldo sin cubrir y `processSaleTransaction` crea `VENTA_FIADA` con `deudaGenerada`.
6. **Órdenes huérfanas**: reabrir mesa limpiaba sesiones duplicadas pero dejaba su orden `OPEN` 48h. Ahora también cancela la orden.
7. **Frescura de consumos**: la cola de cobro del PDV re-sincroniza órdenes al montar (evita cobrar sin consumos añadidos desde otro dispositivo).
8. **Higiene**: logs de pagos solo en DEV; import muerto de `CashierCheckoutView` removido del bundle.
9. **Sobrepago en multipago sin alerta** (reporte: $5 + Bs 9.940 para un total de $10.80 confirmaba sin avisar): nueva capa en el detector — 2+ métodos que juntos exceden el total (tolerancia 0,5% / $0,10) disparan modal “Sobrepago en multipago” con el monto de más. Los pagos redondos de un solo método siguen siendo legítimos. El detector ahora razona sobre la tasa de liquidación (checkoutRate), no la viva.
10. **Tasas cruzadas en vuelto y ⚡Total**: el botón ⚡Total convertía los otros métodos Bs a tasa viva mientras la liquidación usa la implícita → llenaba un resto equivocado en multipago dual. El desglose manual de vuelo ($/Bs) valuaba a tasa viva mientras el banner mostraba el vuelto a tasa implícita. Ambos unificados a la tasa de liquidación.
11. **Gaveta en vivo por sesión**: `buildCurrentFloat` filtraba por día calendario; ahora usa la ventana de la sesión de caja activa (misma que el arqueo), incluyendo el fondo de apertura.

Pendiente conocido (no bloqueante): `CashierCheckoutView`/`CashierPaymentModal` no están montados en ninguna ruta (el cobro único vive en PDV → `TableBillModal` → `CheckoutModal`); el agregado de consumo en mesas requiere sesión cloud (no opera offline); `saleNumber` puede duplicarse entre dispositivos simultáneos (cosmético).

### Correcciones de la auditoría E2E del flujo de reportes (2026-08-27)

<arg_value><b88a6f17>1. **Anular abono/crédito del módulo Clientes no revertía deuda**: `processVoidSale` buscaba `sale.customerId` pero esos registros guardan `clienteId` → anular un abono (COBRO_DEUDA) marcaba ANULADA sin devolver la deuda al cliente, y anular un crédito manual dejaba la deuda cobrada. Extraída `revertCustomerImpact` (inversa exacta de `procesarImpactoCliente`, Golden Rule sobre el neto favor-deuda); acepta ambos ids.
2. **Tarjetas de Cierres inflaban totales con anuladas**: `groupSalesByCierreId` no excluía `status: ANULADA` de stats/cashflow → una venta anulada dentro del turno sumaba $/Bs y pagos al cierre histórico. Excluida.
3. **Historial con filas fantasma de $0.00**: `historySales` incluía `APERTURA_CAJA`/`CIERRE_CAJA` → aparecían como "ventas" de $0.00 en el historial. Excluidas (ajustes ya lo estaban).
4. **Total Bs inflado en filas con vuelto**: `TransactionRow` sumaba `amountInput` brutos → pagar Bs 600 por venta de Bs 500 mostraba "Total en Bs 600". Unificado con `getSaleBs` (un solo criterio con reportes/dashboard).
5. **Rango personalizado invertido** (Desde > Hasta) devolvía vacío silenciosamente. `normalizeDateRange` lo corrige.
6. **Reimpresión PDF de cierre con ganancia 0**: `CierreHistoryCard` pasaba `todayProfit: 0` fijo. Ahora calcula ganancia real con `calculateAggregateProfit`.
7. **Turno sin caja abierta**: el estado vacío de Reportes ahora distingue "Sin caja abierta" de "Sin ventas en el periodo".
8. Defensa en profundidad: `processVoidSale` rechaza ventas protegidas por cierre de caja (`cajaCerrada`) aunque algún caller se salte la UI.

Verificación: `test:reports-flow` — 39 invariantes deterministas (filtros rango/turno, cierres sin anuladas, desglose neto de vuelto, fiado neto, reversiones exactas de cliente).

### Correcciones de la auditoría de tickets y PDFs (2026-08-27)

1. **CRÍTICO — totalBs almacenado con vuelto incluido**: checkoutProcessor guardaba la suma BRUTA de pagos Bs como totalBs de la venta (pagar Bs 600 por una venta de Bs 500 guardaba totalBs=600) → tickets, PDFs de cierre y reportes inflaban los ingresos en Bs. Ahora se guarda el precio real dual-aware (cartTotalBs); el Bs realmente recibido lo calcula getSaleBs desde payments+changeBs.
2. **Un solo criterio de Bs en los 6 renderizadores**: Ticket PDF, térmico HTML, ESC/POS, cierre 58mm, PDF Carta y Reportes ahora usan getSaleBs (neto de vuelto, dual-aware). Los históricos con totalBs bruto quedan corregidos al agregar.
3. **Térmico HTML sin vuelto**: la impresión por sistema no mostraba el cambio entregado. Añadida sección VUELTO ENTREGADO ($ y Bs).
4. **Conteo de ventas inflado en cierres**: 'Ventas realizadas'/'OPERACIONES' contaban el flujo de caja (incluye abonos COBRO_DEUDA y pagos a proveedores). Ahora cuentan ventas reales.
5. **Referencia Bs de ítems ignoraba el precio dual**: Ticket PDF y Carta convertían precioUsd×tasa viva (piña Bs 500 imprimía Bs 400). Ahora respetan exactBs; la Carta además usaba un campo inexistente (s.bcvRate) en vez de la tasa de la venta.
6. **Vuelto con signo legible** en desgloses: '- Bs 100' en vez de 'Bs -100'.
7. **Ganancia protegida contra tasa 0** en ambos PDFs de cierre.
8. COP: se revirtieron los cambios de formato COP — el sistema no trabaja con COP (ramas COP existentes quedan intactas como código muerto).

Verificación: `test:tickets-pdfs` — 33 invariantes deterministas (contrato de almacenamiento, criterio único en los 6 renderizadores, escenario numérico del vuelto en cada capa, históricos corregidos).



### Corrección de Servicios de Pool en Tickets/PDFs (2026-08-27)

- Se creó , cálculo puro compartido por el cierre 58mm y el PDF Carta.
- Solo cuenta  y  válidas; excluye ,  y operaciones de caja.
- Clasifica piñas/partidas, horas y consumos compartidos por separado.
- Respeta  por ítem; cuando no existe usa la tasa capturada de la venta y finalmente la tasa del reporte.
- La zona muestra ahora Bs duales reales para piñas, horas, compartidos y total de mesas.
- Test:  — 10/10 invariantes.


### Corrección de notificación repetida de sincronización (2026-08-27)

-  ya no convierte todo el historial local en cola pendiente durante cada heartbeat, arranque o regreso al primer plano.
- Solo procesa IDs explícitamente pendientes y existentes localmente.
- El toast se muestra únicamente para ventas realmente subidas y se deduplica durante 5 segundos para carreras de arranque/foco.
- El historial existente ya sincronizado no vuelve a generar el mensaje de 1.656 ventas.
- Test:  — 7/7 guardarraíles.


### Limpieza definitiva del toast de sincronización masiva (2026-08-27)

- Se añadió una marca por cuenta para distinguir colas nuevas de la cola heredada creada por versiones anteriores.
- La cola heredada que contenía todo el historial se limpia una sola vez, sin subir, modificar ni borrar ventas.
- Las ventas nuevas mantienen su ID explícito en la cola y siguen sincronizándose normalmente.
- Test:  — 9/9 guardarraíles.

## Auditoría de scroll de escritorio — 2026-08-27

- Layout raíz con una zona de scroll y .
- Reportes e Inventario dejan el scroll al contenedor raíz.
- Clientes conserva scroll interno por subpestaña con espacio seguro para navegación.
- Test:  8/8.
- Build validado.
