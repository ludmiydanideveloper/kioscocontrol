# KioscoControl

Gestor de **inventario y ventas para kioscos**: punto de venta rápido con escáner de
código de barras, control de stock, cuentas corrientes (fiado), caja/arqueo y reportes.

**En producción:** https://kioscocontrol.vercel.app (PWA — se puede "instalar" en el celular).

Funciona en **dos modos**:

| Modo | Cuándo | Datos |
|---|---|---|
| **Local** (por defecto) | Sin configurar nada | `localStorage` del navegador — un solo dispositivo, offline |
| **Supabase** | Al aplicar `schema.sql` y cargar credenciales | Base central, sincronización en tiempo real entre varios dispositivos |

La app detecta sola qué modo usar al arrancar.

En modo Supabase es **multi-tenant**: un mismo proyecto/deploy puede alojar varios
kioscos (negocios) distintos, cada uno con sus propios productos, ventas, clientes,
etc., completamente aislados entre sí — ver [«Varios kioscos (multi-tenant)»](#varios-kioscos-multi-tenant)
más abajo.

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
2. En **Authentication → Providers → Email**, desactivá **"Confirm email"**
   (las dos cuentas de la app —admin y vendedor— no tienen buzón real).
3. En **SQL Editor**, pegá y ejecutá el contenido de [`schema.sql`](schema.sql)
   (crea tablas + funciones RPC + RLS por rol + realtime; es idempotente).
4. Copiá `URL` y `anon key` del proyecto (Settings → API) a `.env.local`:

   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

5. (Opcional) Cargá datos de ejemplo:

   ```bash
   node seed.js            # productos + clientes demo
   node seed.js --reset    # además borra ventas / caja / movimientos previos
   ```

6. `npm run dev`. Como todavía no hay ningún PIN configurado, la app arranca
   abierta como admin: entrá a **Configuración → PIN de administrador** y
   activá uno (mínimo 6 dígitos) para crear la cuenta real. A partir de ahí
   el login pasa a ser obligatorio.

> **Login real con Supabase Auth, multi-tenant.** Cada kiosco tiene dos
> cuentas: `admin@<negocio>.kioscocontrol.local` y `vendedor@<negocio>...`
> (el kiosco original de este proyecto no lleva subdominio: son
> `admin@kioscocontrol.local` / `vendedor@kioscocontrol.local`). El PIN que
> definís en Configuración es la contraseña de esa cuenta. Dejá **"Allow new
> users to sign up"** activado en Authentication → Settings — hace falta para
> que cada kiosco pueda crear su propio admin/vendedor la primera vez; la
> seguridad no depende de bloquear eso, sino de que la función `claim_role()`
> sólo deja reclamar el rol de admin de un negocio que todavía no tiene uno, y
> el de vendedor sólo si ese negocio ya tiene admin. Las políticas RLS exigen
> sesión **y mismo negocio** para cualquier operación, y las tablas con
> información sensible (proveedores, gastos, compras) sólo las puede tocar el
> admin de ESE negocio — todo aplicado en el servidor, no en la interfaz. El
> vendedor cambia su propio PIN desde el ícono de llave en el punto de venta.

---

## Varios kioscos (multi-tenant)

Un mismo proyecto de Supabase (y un mismo deploy de la app) puede alojar
varios negocios distintos, cada uno viendo sólo sus propios productos, ventas,
clientes, etc. Cada dispositivo "recuerda" a qué kiosco pertenece (guardado en
el navegador); por defecto es el kiosco original, sin nada que configurar.

**Alta de un kiosco nuevo — el dueño se registra solo** (camino normal): en la
pantalla de login, "¿No tenés cuenta? Creá tu kiosco" — pone el nombre de su
negocio, elige un código único, y su email/contraseña reales. Queda como
administrador de un negocio nuevo, aislado del resto, sin que vos tengas que
hacer nada ni ver su contraseña.

**Alternativa — vos reservás el código de antemano** (por si querés avisarle
a alguien con un link/código ya armado): abrí [`onboard-tenant.sql`](onboard-tenant.sql),
completá el slug y el nombre, y corré ese `insert` en el SQL Editor. El dueño
igual se activa su propio PIN de administrador desde la app (toca **"¿Es otro
kiosco? Cambiar"**, pone el código, y en Configuración activa su PIN) — esta
vía es sólo para el kiosco original de este proyecto o si preferís PIN en vez
de email+contraseña para ese negocio en particular.

Los datos de cada negocio están completamente aislados a nivel de base de
datos (no es sólo un filtro en la interfaz): las políticas RLS de
`schema.sql` exigen que cada fila pertenezca al mismo negocio que el usuario
logueado, así que ni con la anon key expuesta en el bundle se puede leer o
escribir datos de otro kiosco.

---

## Funcionalidad

### Venta rápida (POS)
- Escaneo con cámara del celular o lector USB/Bluetooth → agrega al carrito.
- Búsqueda por nombre o código; botones de acceso rápido.
- Control de stock: no deja vender más de lo que hay.
- **Venta por peso** (productos por kg: se piden los gramos) y **monto libre**
  (cigarrillo suelto, algo sin código).
- Medios de pago: efectivo (con cálculo de vuelto y billetes), transferencia/QR,
  débito, crédito y **fiado** (asociado a un cliente).
- Descuento por ticket. Comprobante por WhatsApp o ticket 58mm.

### Inventario
- Alta/edición/baja de productos (baja lógica: no rompe el histórico).
- Categoría, marca, proveedor, costo, venta, margen calculado, stock y alerta mínima.
- Producto por unidad o **por peso (kg)**.
- **Generar código interno** (EAN-13 válido, prefijo 20) para productos sin código.
- **Etiquetas imprimibles**: elegís productos y cantidades, se imprime una hoja A4
  con código de barras + nombre + precio.
- **Compra a proveedor**: ingresa stock, actualiza el costo y, si queda en cuenta,
  suma a la deuda con ese proveedor.
- **Actualización de precios por %** (para inflación), por categoría o a todo.
- **Movimientos de stock**: historial auditable (venta, compra, ajuste, alta…).

### Alertas de stock
- Productos en o bajo el mínimo. Reposición rápida (+5 / +10 / +24 / personalizado).
- Generación de pedido a proveedor al portapapeles.

### Fiado / Cuentas corrientes (clientes)
- Saldo por cliente, registro de pagos (parciales o totales), historial.
- Recordatorio de deuda por WhatsApp.

### Proveedores
- Cuánto le debés a cada proveedor, pagos con historial, compras asociadas.

### Caja
- Apertura con fondo inicial. Ingresos y retiros manuales.
- Suma automática de ventas en efectivo, pagos de fiado, gastos y pagos a proveedores.
- Cierre con arqueo: efectivo esperado vs. contado y diferencia. Historial de cierres.

### Reportes
- Rango: hoy / ayer / 7 días / mes / personalizado.
- Ventas, ganancia bruta, **gastos** y **ganancia neta real** (bruta − gastos).
- Ticket promedio, valuación de inventario, total a cobrar y total a pagar.
- Ventas por hora/día, por medio de pago, ranking de más vendidos.
- **Gastos del kiosco** (alquiler, luz, sueldos…) con alta y borrado desde acá.
- **Anular venta**: repone stock, revierte fiado y caja.
- Exportación a CSV e impresión.

### Roles (Configuración)
- **Administrador**: ve todo. En modo Supabase se registra con **su email y
  contraseña reales** (botón "¿No tenés cuenta? Creá tu kiosco" en la pantalla
  de login) o —para el kiosco original de este proyecto— con un PIN. Con
  sesión iniciada, siempre pide login al volver a abrir la app.
- **Empleados**: el admin los da de alta desde **Configuración → Empleados**
  (nombre + PIN); cada uno entra sólo con su PIN, nunca con email. Por
  defecto sólo ven el **punto de venta**; el admin puede habilitarles, una
  por una, el resto de las pestañas (Inventario, Fiado, Proveedores, Caja,
  Reportes) — Configuración nunca es delegable. Cada empleado cambia su
  propio PIN desde el punto de venta (ícono de llave); ni el admin puede
  vérselo o resetéarselo sin que él lo sepa.
- Sin admin configurado la app queda abierta (todo visible) — sólo aplica en
  modo local o antes del primer setup en Supabase.
- **En modo Supabase el login es real** (Supabase Auth) y las políticas RLS
  lo exigen del lado del servidor, no sólo en la interfaz: ni con la anon key
  expuesta en el bundle se puede leer o escribir nada sin sesión, y las
  tablas de proveedores/gastos/compras sólo las toca el admin de ese negocio.
  En modo local el PIN es sólo un hash en el navegador (disuade, no protege).

### Extras
- **PWA**: instalable en el celular/tablet, funciona sin conexión.
- **Impresión de ticket 58mm** para comandera térmica (botón "Ticket" tras cada venta).
- **Backup / restore** de datos en JSON, y **subida del store local a la base central**
  (Configuración) para cuando se trabajó offline.
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
| `npm test` | Tests (Vitest) de la lógica de datos |
| `npm run gen-icons` | Regenera los iconos PWA desde el SVG |
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
    ui.tsx                 sistema de diseño (Card, Button, Modal, Stat…)
    HeaderNav.tsx          navegación + estado de conexión
    QuickSalesPOS.tsx      punto de venta (unidad, peso, monto libre, fiado)
    InventoryManager.tsx   inventario + compras + movimientos + precios %
    LowStockAlerts.tsx     alertas y reposición
    CustomersView.tsx      fiado / cuentas corrientes de clientes
    SuppliersView.tsx      cuentas corrientes con proveedores
    CashRegister.tsx       caja y arqueo
    ReportsView.tsx        métricas, gráficos y gastos
    BarcodeScannerModal.tsx  escáner de cámara
    LockScreen / SettingsModal / ChangePinModal
  utils/
    db.ts                 facade: elige backend (supabase | local) + migración
    localStore.ts         backend localStorage
    supabase.ts           cliente Supabase
    auth.ts               login: PIN local o Supabase Auth real, según backend
    demoData.ts           catálogo, clientes, proveedores y ventas de demo
    format.ts / dateRange.ts / backup.ts / printTicket.ts / barcode.ts
    *.test.ts             tests de la lógica de datos (Vitest)
schema.sql               esquema + funciones RPC de Supabase, multi-tenant (idempotente)
onboard-tenant.sql       da de alta un kiosco nuevo (tenant)
seed.js                  carga demo en Supabase (con 30 días de ventas)
```
