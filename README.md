# KioscoControl

Gestor de **inventario y ventas para kioscos**: punto de venta rápido con escáner de
código de barras, control de stock, cuentas corrientes (fiado), caja/arqueo y reportes.

**En producción:** https://kioscocontrol.vercel.app (PWA — se puede "instalar" en el celular).

Funciona en **dos modos**:

| Modo | Cuándo | Datos |
|---|---|---|
| **Local** (por defecto) | Sin configurar nada | `localStorage` del navegador — un solo dispositivo, offline |
| **Supabase** | Al aplicar `schema.sql` y cargar credenciales | Base central, sincronización en tiempo real entre varios dispositivos |

La app detecta sola qué modo usar al arrancar (badge **LOCAL** / **LIVE SYNC** en el header).

---

## Requisitos

- Node.js 20+

## Uso rápido (modo local)

```bash
npm install
npm run dev
```

Abrí http://localhost:5173. Arranca con un catálogo de demo (~24 productos y 3 clientes).
Los datos quedan guardados en el navegador. Para empezar de cero: borrá el
almacenamiento del sitio o ejecutá en la consola `localStorage.removeItem('kioscocontrol:v1')`.

## Modo Supabase (base central, multi-dispositivo)

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegá y ejecutá el contenido de [`schema.sql`](schema.sql)
   (crea tablas + funciones RPC + RLS + realtime; es idempotente).
3. Copiá `URL` y `anon key` del proyecto (Settings → API) a `.env.local`:

   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. (Opcional) Cargá datos de ejemplo:

   ```bash
   node seed.js            # productos + clientes demo
   node seed.js --reset    # además borra ventas / caja / movimientos previos
   ```

5. `npm run dev`. El header debe mostrar **LIVE SYNC** en verde.

> RLS viene abierto (acceso anónimo total), pensado para un kiosco con un dispositivo
> de confianza. Para multiusuario con login, reemplazá las policies de `schema.sql`
> por unas basadas en `auth.uid()`.

---

## Funcionalidad

### Venta rápida (POS)
- Escaneo con cámara del celular o lector USB/Bluetooth → agrega al carrito.
- Búsqueda por nombre o código; botones de acceso rápido.
- Control de stock: no deja vender más de lo que hay.
- Medios de pago: efectivo (con cálculo de vuelto y billetes), transferencia/QR,
  débito, crédito y **fiado** (asociado a un cliente).
- Descuento por ticket. Comprobante por WhatsApp.

### Inventario
- Alta/edición/baja de productos (baja lógica: no rompe el histórico).
- Categoría, marca, proveedor, costo, venta, margen calculado, stock y alerta mínima.
- **Compra a proveedor**: ingresa stock y actualiza el costo en un solo paso.
- **Movimientos de stock**: historial auditable (venta, compra, ajuste, alta…).

### Alertas de stock
- Productos en o bajo el mínimo. Reposición rápida (+5 / +10 / +24 / personalizado).
- Generación de pedido a proveedor al portapapeles.

### Fiado / Cuentas corrientes
- Saldo por cliente, registro de pagos (parciales o totales), historial.
- Recordatorio de deuda por WhatsApp.

### Caja
- Apertura con fondo inicial. Ingresos y retiros manuales.
- Suma automática de ventas en efectivo y pagos de fiado.
- Cierre con arqueo: efectivo esperado vs. contado y diferencia. Historial de cierres.

### Reportes
- Rango: hoy / ayer / 7 días / mes / personalizado.
- Ventas, ganancia neta y margen, ticket promedio, unidades.
- Valuación de inventario, ganancia potencial, total a cobrar.
- Ventas por hora/día, por medio de pago, ranking de más vendidos.
- **Anular venta**: repone stock, revierte fiado y caja.
- Exportación a CSV e impresión.

### Extras
- **PWA**: instalable en el celular/tablet, funciona sin conexión.
- **PIN de acceso** opcional (Configuración → PIN).
- **Impresión de ticket 58mm** para comandera térmica (botón "Ticket" tras cada venta).
- **Backup / restore** de datos en JSON (Configuración).
- Nombre del kiosco configurable (aparece en el ticket).

---

## Deploy (Vercel)

Ya está deployado. Para volver a publicar tras un cambio:

```bash
npx vercel deploy --prod --yes
```

Si conectás el repo de GitHub a Vercel, cada `git push` deploya solo.
Para usar la base central en producción, cargá `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` en **Vercel → Project → Settings → Environment Variables**
y volvé a deployar.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Build de producción a `dist/` |
| `npm run preview` | Sirve el build |
| `npm run lint` | Chequeo de tipos (`tsc --noEmit`) |
| `node seed.js` | Carga datos demo en Supabase |

## Stack

React 19 · Vite 6 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Realtime) ·
Recharts · html5-qrcode · lucide-react

## Estructura

```
src/
  App.tsx                 orquestador, tabs, escáner, realtime
  types.ts                modelos de dominio
  components/
    HeaderNav.tsx          navegación + estado de conexión
    QuickSalesPOS.tsx       punto de venta
    InventoryManager.tsx    inventario + compras + movimientos
    LowStockAlerts.tsx      alertas y reposición
    CustomersView.tsx       fiado / cuentas corrientes
    CashRegister.tsx        caja y arqueo
    ReportsView.tsx         métricas y gráficos
    BarcodeScannerModal.tsx escáner de cámara
  utils/
    db.ts                 facade: elige backend (supabase | local)
    localStore.ts          backend localStorage
    supabase.ts            cliente Supabase
    demoData.ts            catálogo de demo
    format.ts / dateRange.ts  helpers
schema.sql                esquema + funciones RPC de Supabase
seed.js                   carga de datos demo
```
