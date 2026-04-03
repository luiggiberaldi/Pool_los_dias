# 🎱 Pool Los Diaz — Sistema POS para Salón de Billar

**Pool Los Diaz** es un Sistema Integral de Punto de Venta (POS) diseñado específicamente para la gestión de un salón de billar. Construido con arquitectura **Offline-First**, garantiza continuidad del negocio sin importar la conectividad, con sincronización en la nube mediante Supabase cuando la conexión está disponible.

Funciona como **Progressive Web App (PWA)** instalable en cualquier dispositivo (PC, Android, iOS) sin necesidad de una tienda de aplicaciones.

> 📋 Ver [ROADMAP.md](./ROADMAP.md) para las fases de desarrollo planificadas.  
> 📓 Ver [BITACORA.md](./BITACORA.md) para el historial de avances y decisiones técnicas.

---

## 🚀 Características Actuales

### Motor de Ventas
- Procesamiento de ventas con múltiples métodos de pago simultáneos (USD, Bs, COP, Pago Móvil, Fiado)
- Motor transaccional atómico vía RPC en Supabase (`process_checkout`)
- Cola de emergencia offline — las ventas nunca se pierden sin internet
- Contabilidad de doble partida para integridad financiera

### Sincronización
- Sincronización P2P en tiempo real (`useCloudSync`) cuando hay internet
- Caché offline con `localforage` (IndexedDB) como fuente principal
- Reconciliación automática al recuperar conexión

### Tickets e Impresión
- Generación de tickets PDF con `jsPDF` — formato 58mm térmico
- Impresión directa en impresoras térmicas USB/Bluetooth
- Logo con **aspect ratio dinámico** (sin distorsión)
- Reporte de Cierre del Día exportable como PDF

### Tarifas y Monedas
- Tasa BCV en tiempo real como referencia base
- Soporte para Peso Colombiano (COP) con TRM automática
- Conversiones USD ↔ Bs ↔ COP en tiempo real

### Seguridad y Licencias
- Sistema de licencias por dispositivo con validación en Supabase
- Control de sesiones de dispositivos (máx. N dispositivos por licencia)
- Pantalla de bloqueo automática por inactividad

---

## 🗺️ Fases de Desarrollo (Roadmap)

| Fase | Descripción | Estado |
|------|-------------|--------|
| **0** | Infraestructura base, branding, motor de ventas | ✅ Completa |
| **1** | Login con PIN y roles (Admin/Cajero/Mesero) | 🔄 En progreso |
| **2** | Plano interactivo de mesas con timers | ⏳ Pendiente |
| **3** | Órdenes y comandas por mesa | ⏳ Pendiente |
| **4** | Apertura y cierre de caja formal | ⏳ Pendiente |
| **5** | Inventario de barra y cocina | ⏳ Pendiente |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite |
| Estilos | Tailwind CSS |
| Estado global | Zustand + React Context |
| Backend / DB | Supabase (PostgreSQL + Realtime) |
| Persistencia offline | LocalForage (IndexedDB) |
| PWA | Vite PWA Plugin |
| Documentos | jsPDF |
| Iconos UI | Lucide React |

---

## 📂 Estructura del Proyecto

```text
poolbar/
├── public/              # Estáticos, logo-ticket.png, íconos PWA
├── src/
│   ├── components/      # Componentes reutilizables
│   │   ├── security/    # LoginScreen, PinPad, Guards de rol
│   │   ├── Settings/    # Tabs de configuración, UsersManager
│   │   └── ...
│   ├── config/          # supabaseCloud.js, paymentMethods.js
│   ├── context/         # ProductContext, AuthContext
│   ├── hooks/
│   │   └── store/       # authStore.js, useCloudSync.js
│   ├── utils/           # ticketGenerator.js, checkoutProcessor.js
│   │                    # dailyCloseGenerator.js, offlineQueueService.js
│   ├── views/           # SalesView, DashboardView, SettingsView...
│   ├── App.jsx          # Componente raíz y navegación por estado
│   └── main.jsx         # Punto de entrada
├── ROADMAP.md           # Hoja de ruta del proyecto
├── BITACORA.md          # Bitácora de avances y decisiones
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## 💻 Desarrollo e Instalación

### Requisitos Previos
- [Node.js](https://nodejs.org/) v20+
- Proyecto activo en [Supabase](https://supabase.com/) — Ref: `raxcxddreghynthyvllh`

### Instrucciones

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar en modo desarrollo
npm run dev

# 3. Construir para producción
npm run build
```

### Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build optimizado para producción |
| `npm run preview` | Previsualizar el build de producción |
| `npm run lint` | Ejecutar ESLint |

---

## 📐 Reglas del Sistema

1. **Offline-First** — Toda acción funciona sin internet.
2. **PIN Hasheado** — SHA-256 vía Web Crypto API. Nunca texto plano.
3. **Doble Partida** — Integridad contable garantizada.
4. **Papel 58mm** — Todos los documentos optimizados para impresora térmica 58mm.
5. **Moneda base USD** — Bs y COP son conversiones dinámicas.

---

## 🤝 Metodología

- Principios **SOLID** y **Clean Architecture**
- Componentes atómicos y reutilizables
- Manejo de errores con fallback offline en cada capa
