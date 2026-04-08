# 🎱 Pool Los Diaz — Sistema POS para Sala de Billar

**Pool Los Diaz** es un Sistema Integral de Punto de Venta (POS) diseñado específicamente para la gestión de una sala de pool y billar. Construido con arquitectura **Offline-First**, garantiza continuidad del negocio sin importar la conectividad, con sincronización en la nube mediante Supabase cuando la conexión está disponible.

Funciona como **Progressive Web App (PWA)** instalable en cualquier dispositivo (PC, Android, iOS) sin necesidad de una tienda de aplicaciones.

> 📋 Ver [ROADMAP.md](./ROADMAP.md) para las fases de desarrollo planificadas.
> 📓 Ver [BITACORA.md](./BITACORA.md) para el historial de avances y decisiones técnicas.

---

## 🚀 Características Actuales

### Gestión de Mesas de Pool
- Plano interactivo de mesas con estado en tiempo real (Libre / Activa)
- Modo **Normal** (cobro por tiempo) y modo **Piña** (precio fijo por partida)
- Timers por mesa con cálculo automático de costo según tarifa configurada
- Comandas por mesa — los meseros añaden productos directamente desde la mesa activa
- Ajuste manual de tiempo y anulación de sesión (solo Admin)
- Confirmación de Piña para meseros (evita errores de dedo al no poder anular)
- Tickets de cierre de mesa con desglose de tiempo + consumo

### Motor de Ventas
- Carrito con múltiples productos y descuento global
- Múltiples métodos de pago simultáneos: USD, Bolívares, Pago Móvil, Fiado
- Motor transaccional atómico vía RPC en Supabase (`process_checkout`)
- Cola de emergencia offline — las ventas nunca se pierden sin internet
- Contabilidad de doble partida para integridad financiera

### Gestión de Caja
- Apertura y cierre de turno con monto inicial y monto final
- Dashboard con métricas en tiempo real (ventas, tiempo de mesas, métodos de pago)
- Reporte de cierre exportable como PDF térmico 58mm

### Inventario
- Productos con precio en USD (con conversión automática a Bs)
- Soporte para **Lotes/Bultos** — precio unitario calculado desde precio de compra por bulto
- Control de stock con alertas de bajo inventario
- Margen de ganancia calculado automáticamente

### Sincronización
- Sincronización P2P en tiempo real (`useCloudSync`) cuando hay internet
- Caché offline con `localforage` (IndexedDB) como fuente principal
- Reconciliación automática al recuperar conexión

### Tickets e Impresión
- Generación de tickets PDF con `jsPDF` — formato 58mm térmico
- Impresión directa en impresoras térmicas USB/Bluetooth vía ESC/POS y Web Serial
- Logo con **aspect ratio dinámico** (sin distorsión)
- Reporte de cierre del día exportable como PDF

### Tarifas y Monedas
- Tasa BCV en tiempo real como referencia base
- Conversiones USD ↔ Bs en tiempo real
- Configuración de tarifas por modo de mesa (Normal / Piña) con soporte de rangos horarios

### Gestión de Usuarios
- Tres roles: **Administrador**, **Cajero**, **Mesero**
- Acceso mediante PIN personal (SHA-256, nunca en texto plano)
- Activar / desactivar usuarios sin perder historial
- Eliminar usuario permanentemente
- Permisos de apertura/cierre delegables al Cajero

### Seguridad y Licencias
- Sistema de licencias por dispositivo con validación en Supabase
- Pantalla de bloqueo automática por inactividad
- Bitácora de auditoría con registro de eventos por usuario
- Términos y Condiciones obligatorios al primer uso

### Onboarding
- Tour interactivo guiado por rol (Admin / Cajero / Mesero) al aceptar T&C
- Mini-tours por pestaña al visitarla por primera vez
- Tours contextuales en formularios clave: Producto, Checkout, Carrito, Configuración

---

## 🗺️ Fases de Desarrollo (Roadmap)

| Fase | Descripción | Estado |
|------|-------------|--------|
| **0** | Infraestructura base, branding, motor de ventas | ✅ Completa |
| **1** | Login con PIN y roles (Admin/Cajero/Mesero) | ✅ Completa |
| **2** | Plano interactivo de mesas con timers | ✅ Completa |
| **3** | Órdenes y comandas por mesa | ✅ Completa |
| **4** | Apertura y cierre de caja formal | ✅ Completa |
| **5** | Inventario con lotes, márgenes y stock | ✅ Completa |
| **6** | Refactorización y modularización del código | ✅ Completa |
| **7** | Onboarding con SpotlightTour por rol y por sección | ✅ Completa |
| **8** | Gestión avanzada de usuarios (activar/desactivar/eliminar) | ✅ Completa |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite |
| Estilos | Tailwind CSS |
| Estado global | Zustand |
| Backend / DB | Supabase (PostgreSQL + Realtime) |
| Persistencia offline | LocalForage (IndexedDB) |
| PWA | Vite PWA Plugin |
| Documentos | jsPDF |
| Iconos UI | Lucide React |
| Package manager | Bun |

---

## 📂 Estructura del Proyecto

```text
Pool_los_dias/
├── public/              # Estáticos, logo-ticket.png, íconos PWA
├── src/
│   ├── components/
│   │   ├── Sales/       # CheckoutModal, CartPanel, CustomerPickerSection
│   │   ├── Products/    # ProductFormModal, ProductCard
│   │   ├── tables/      # TableCard, TableGrid, OrderPanel
│   │   ├── Settings/    # Tabs de configuración (mesas, ventas, usuarios, bitácora, sistema)
│   │   ├── security/    # LoginScreen, PinPad, Guards de rol
│   │   └── ...          # Modal, SpotlightTour, TermsOverlay, etc.
│   ├── config/          # supabaseCloud.js, paymentMethods.js, tourSteps.js
│   ├── hooks/
│   │   ├── store/       # useAuthStore, useCashStore, useTablesStore, useOrdersStore, ...
│   │   ├── useOnboardingTour.js
│   │   ├── useCloudSync.js
│   │   └── ...
│   ├── utils/           # ticketGenerator, thermalTicketGenerator, tableTicketGenerator
│   │                    # checkoutProcessor, dailyCloseGenerator, offlineQueueService
│   ├── views/           # DashboardView, SalesView, ProductsView,
│   │                    # ReportsView, SettingsView, TablesView
│   ├── App.jsx          # Componente raíz, navegación y router de estado
│   └── main.jsx         # Punto de entrada
├── ROADMAP.md
├── BITACORA.md
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## 💻 Desarrollo e Instalación

### Requisitos Previos
- [Bun](https://bun.sh/) v1.0+
- Proyecto activo en [Supabase](https://supabase.com/)

### Instrucciones

```bash
# 1. Instalar dependencias
bun install

# 2. Iniciar en modo desarrollo
bun run dev

# 3. Construir para producción
bun run build
```

### Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `bun run dev` | Servidor de desarrollo con HMR |
| `bun run build` | Build optimizado para producción |
| `bun run preview` | Previsualizar el build de producción |
| `bun run lint` | Ejecutar ESLint |

---

## 📐 Reglas del Sistema

1. **Offline-First** — Toda acción funciona sin internet.
2. **PIN Hasheado** — SHA-256 vía Web Crypto API. Nunca texto plano.
3. **Doble Partida** — Integridad contable garantizada.
4. **Papel 58mm** — Todos los documentos optimizados para impresora térmica 58mm.
5. **Moneda base USD** — Bolívares es conversión dinámica vía tasa BCV.
6. **Roles y Permisos** — Cada acción está gated por el rol del usuario en sesión.

---

## 🤝 Metodología

- Principios **SOLID** y **Clean Architecture**
- Componentes atómicos y reutilizables
- Hooks personalizados para separar lógica de negocio de la presentación
- Archivos de vista limitados a ~450 líneas máximo
- Manejo de errores con fallback offline en cada capa
