-- ============================================================================
-- KioscoControl — Esquema completo
-- Ejecutar en el SQL Editor del Dashboard de Supabase.
-- Es idempotente: se puede volver a correr para actualizar tablas y funciones.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Productos
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id          text primary key,
  barcode     text unique not null,
  name        text not null,
  category    text not null default 'Varios',
  brand       text,
  supplier    text,
  "costPrice" numeric not null default 0,
  "sellPrice" numeric not null default 0,
  stock       numeric not null default 0,
  "minStock"  numeric not null default 5,
  unit        text default 'unidad',
  "priceUnit" text not null default 'unit',   -- unit | kg
  "imageUrl"  text,
  "isActive"  boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Ventas
-- ----------------------------------------------------------------------------
create table if not exists public.sales (
  id              text primary key,
  timestamp       timestamptz not null default now(),
  items           jsonb not null,
  subtotal        numeric not null default 0,
  discount        numeric not null default 0,
  total           numeric not null,
  "totalCost"     numeric not null default 0,
  profit          numeric not null default 0,
  "paymentMethod" text not null,
  "amountPaid"    numeric,
  "changeGiven"   numeric,
  "customerId"    text,
  "customerName"  text,
  notes           text,
  "cashSessionId" text,
  status          text not null default 'completed'
);
create index if not exists sales_timestamp_idx on public.sales (timestamp desc);

-- ----------------------------------------------------------------------------
-- Movimientos de stock (auditoría)
-- ----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id           text primary key default gen_random_uuid()::text,
  "productId"  text not null references public.products(id) on delete cascade,
  type         text not null,          -- venta | compra | ajuste | devolucion | merma | alta
  quantity     numeric not null,       -- firmado
  "stockAfter" numeric not null,
  reason       text,
  "refId"      text,
  "createdAt"  timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements ("productId", "createdAt" desc);

-- ----------------------------------------------------------------------------
-- Clientes / cuenta corriente (fiado)
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  phone       text,
  notes       text,
  balance     numeric not null default 0,   -- positivo = el cliente debe
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.customer_payments (
  id           text primary key default gen_random_uuid()::text,
  "customerId" text not null references public.customers(id) on delete cascade,
  amount       numeric not null,
  method       text not null default 'efectivo',
  notes        text,
  "createdAt"  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Proveedores / cuenta corriente (a quién le debo)
-- ----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  phone       text,
  notes       text,
  balance     numeric not null default 0,   -- positivo = le debo al proveedor
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.supplier_payments (
  id           text primary key default gen_random_uuid()::text,
  "supplierId" text not null references public.suppliers(id) on delete cascade,
  amount       numeric not null,
  method       text not null default 'efectivo',
  notes        text,
  "createdAt"  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Gastos del kiosco
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id              text primary key default gen_random_uuid()::text,
  date            timestamptz not null default now(),
  category        text not null default 'General',
  description     text,
  amount          numeric not null,
  "paymentMethod" text not null default 'efectivo',
  "cashSessionId" text,
  "createdAt"     timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses (date desc);

-- ----------------------------------------------------------------------------
-- Caja / arqueo
-- ----------------------------------------------------------------------------
create table if not exists public.cash_sessions (
  id                     text primary key default gen_random_uuid()::text,
  "openedAt"             timestamptz not null default now(),
  "closedAt"             timestamptz,
  "openingAmount"        numeric not null default 0,
  "closingCountedAmount" numeric,
  "expectedAmount"       numeric,
  difference             numeric,
  notes                  text,
  status                 text not null default 'open'   -- open | closed
);
create index if not exists cash_sessions_status_idx on public.cash_sessions (status, "openedAt" desc);

create table if not exists public.cash_movements (
  id              text primary key default gen_random_uuid()::text,
  "cashSessionId" text not null references public.cash_sessions(id) on delete cascade,
  type            text not null,   -- apertura | ingreso | retiro | venta_efectivo | pago_fiado | gasto | pago_proveedor
  amount          numeric not null,
  reason          text,
  "createdAt"     timestamptz not null default now()
);
create index if not exists cash_movements_session_idx on public.cash_movements ("cashSessionId", "createdAt");

-- ----------------------------------------------------------------------------
-- Compras a proveedor
-- ----------------------------------------------------------------------------
create table if not exists public.purchases (
  id           text primary key default gen_random_uuid()::text,
  timestamp    timestamptz not null default now(),
  supplier     text,
  "supplierId" text,
  items        jsonb not null,
  total        numeric not null default 0,
  paid         boolean not null default true,
  notes        text
);

-- ----------------------------------------------------------------------------
-- Migraciones para bases creadas con una versión anterior del schema
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.products        alter column stock type numeric;
  alter table public.products        alter column "minStock" type numeric;
  alter table public.stock_movements alter column quantity type numeric;
  alter table public.stock_movements alter column "stockAfter" type numeric;
exception when others then null;
end $$;
alter table public.products  add column if not exists "priceUnit" text not null default 'unit';
alter table public.purchases add column if not exists "supplierId" text;
alter table public.purchases add column if not exists paid boolean not null default true;

-- Columnas que pueden faltar si `products` viene de una versión muy anterior
-- (create table if not exists no las agrega a una tabla que ya existe).
alter table public.products add column if not exists category    text not null default 'Varios';
alter table public.products add column if not exists brand       text;
alter table public.products add column if not exists supplier    text;
alter table public.products add column if not exists "costPrice" numeric not null default 0;
alter table public.products add column if not exists "sellPrice" numeric not null default 0;
alter table public.products add column if not exists "minStock"  numeric not null default 5;
alter table public.products add column if not exists unit        text default 'unidad';
alter table public.products add column if not exists "imageUrl"  text;
alter table public.products add column if not exists "isActive"  boolean not null default true;
alter table public.products add column if not exists "createdAt" timestamptz not null default now();
alter table public.products add column if not exists "updatedAt" timestamptz not null default now();

alter table public.sales add column if not exists subtotal        numeric not null default 0;
alter table public.sales add column if not exists discount        numeric not null default 0;
alter table public.sales add column if not exists "totalCost"     numeric not null default 0;
alter table public.sales add column if not exists profit          numeric not null default 0;
alter table public.sales add column if not exists "amountPaid"    numeric;
alter table public.sales add column if not exists "changeGiven"   numeric;
alter table public.sales add column if not exists "customerId"    text;
alter table public.sales add column if not exists "customerName"  text;
alter table public.sales add column if not exists notes           text;
alter table public.sales add column if not exists "cashSessionId" text;
alter table public.sales add column if not exists status          text not null default 'completed';

alter table public.customers add column if not exists phone       text;
alter table public.customers add column if not exists notes       text;
alter table public.customers add column if not exists balance     numeric not null default 0;
alter table public.customers add column if not exists "createdAt" timestamptz not null default now();
alter table public.customers add column if not exists "updatedAt" timestamptz not null default now();

alter table public.stock_movements add column if not exists "refId" text;

-- ============================================================================
-- Login real (Supabase Auth) — dos cuentas fijas por kiosco:
--   admin@kioscocontrol.local  y  vendedor@kioscocontrol.local
-- La "contraseña" de cada cuenta es el PIN que se define desde Configuración.
-- `profiles` guarda el rol de cada auth.users; `app_meta` es una fila pública
-- (sin datos sensibles) que le dice a la pantalla de login si ya hay admin/
-- vendedor configurados, sin necesitar sesión.
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','cashier')),
  active boolean not null default true,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.app_meta (
  id text primary key default 'singleton',
  admin_configured boolean not null default false,
  cashier_active boolean not null default false
);
insert into public.app_meta (id) values ('singleton') on conflict (id) do nothing;

-- Corre "as owner" (evita recursión de RLS al consultar profiles desde policies).
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;
grant execute on function public.is_admin() to authenticated, anon;

-- Reclama un rol para el usuario recién autenticado (llamado una vez, tras
-- signUp). El admin sólo se puede reclamar si no existe todavía; el vendedor
-- sólo si ya hay un admin configurado. No se puede escalar privilegios.
create or replace function public.claim_role(p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_meta record;
begin
  if p_role not in ('admin','cashier') then
    raise exception 'Rol inválido';
  end if;
  select * into v_meta from public.app_meta where id = 'singleton' for update;
  if p_role = 'admin' then
    if v_meta.admin_configured then
      raise exception 'El administrador ya está configurado';
    end if;
    insert into public.profiles (id, role, active) values (auth.uid(), 'admin', true)
      on conflict (id) do update set role = 'admin', active = true;
    update public.app_meta set admin_configured = true where id = 'singleton';
  else
    if not v_meta.admin_configured then
      raise exception 'Primero configurá el administrador';
    end if;
    insert into public.profiles (id, role, active) values (auth.uid(), 'cashier', true)
      on conflict (id) do update set role = 'cashier', active = true;
    update public.app_meta set cashier_active = true where id = 'singleton';
  end if;
end;
$$;
grant execute on function public.claim_role(text) to authenticated;

-- El admin activa/desactiva el acceso del vendedor sin tocar su contraseña.
create or replace function public.set_cashier_active(p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Sólo el administrador puede hacer esto';
  end if;
  update public.profiles set active = p_active where role = 'cashier';
  update public.app_meta set cashier_active = p_active where id = 'singleton';
end;
$$;
grant execute on function public.set_cashier_active(boolean) to authenticated;

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (auth.uid() = id or public.is_admin());
-- Sin policies de insert/update/delete: todo pasa por las funciones de arriba.

alter table public.app_meta enable row level security;
drop policy if exists app_meta_select_public on public.app_meta;
create policy app_meta_select_public on public.app_meta for select using (true);
-- Sin policies de escritura directa: sólo las funciones (security definer) la tocan.

-- ============================================================================
-- RLS de datos — requiere sesión (Supabase Auth). Tablas con información
-- financiera sensible (deudas, gastos, compras) sólo las ve/edita el admin;
-- el resto (venta, stock, fiado, caja) lo puede operar cualquier usuario
-- logueado, porque el vendedor las necesita para vender.
-- ============================================================================
do $$
declare t text;
begin
  -- Nivel 1: cualquier usuario autenticado (admin o vendedor).
  foreach t in array array[
    'sales','stock_movements','customers','customer_payments',
    'cash_sessions','cash_movements'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$I;', t);
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$I;', t);
    execute format(
      'create policy "auth_all_%1$s" on public.%1$I for all using (auth.uid() is not null) with check (auth.uid() is not null);',
      t
    );
  end loop;

  -- Nivel 2: sólo administrador (proveedores, gastos, compras, pagos a proveedor).
  foreach t in array array['suppliers','supplier_payments','expenses','purchases']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$I;', t);
    execute format('drop policy if exists "admin_all_%1$s" on public.%1$I;', t);
    execute format(
      'create policy "admin_all_%1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin());',
      t
    );
  end loop;
end $$;

-- products: cualquier logueado puede ver/vender; sólo el admin da de alta,
-- edita o cambia precios/costos.
alter table public.products enable row level security;
drop policy if exists "anon_all_products" on public.products;
drop policy if exists products_select on public.products;
drop policy if exists products_write on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_select on public.products for select using (auth.uid() is not null);
create policy products_write on public.products for insert with check (public.is_admin());
create policy products_update on public.products for update using (public.is_admin()) with check (public.is_admin());
create policy products_delete on public.products for delete using (public.is_admin());

-- ============================================================================
-- Realtime
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['products','sales','customers','suppliers','cash_sessions']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ============================================================================
-- FUNCIONES RPC — operaciones atómicas
-- ============================================================================

-- Registra una venta: inserta la venta, descuenta stock con movimientos,
-- actualiza saldo del cliente si es fiado y suma a caja si es efectivo.
create or replace function public.process_sale(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item        jsonb;
  v_new_stock numeric;
  v_sale_id   text := payload->>'id';
  v_pm        text := payload->>'paymentMethod';
  v_cash      text := nullif(payload->>'cashSessionId', '');
  v_customer  text := nullif(payload->>'customerId', '');
  v_total     numeric := (payload->>'total')::numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  insert into public.sales (
    id, timestamp, items, subtotal, discount, total, "totalCost", profit,
    "paymentMethod", "amountPaid", "changeGiven", "customerId", "customerName",
    notes, "cashSessionId", status
  ) values (
    v_sale_id, now(), payload->'items',
    coalesce((payload->>'subtotal')::numeric, v_total),
    coalesce((payload->>'discount')::numeric, 0),
    v_total,
    coalesce((payload->>'totalCost')::numeric, 0),
    coalesce((payload->>'profit')::numeric, 0),
    v_pm,
    nullif(payload->>'amountPaid', '')::numeric,
    nullif(payload->>'changeGiven', '')::numeric,
    v_customer,
    nullif(payload->>'customerName', ''),
    nullif(payload->>'notes', ''),
    v_cash,
    'completed'
  );

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    update public.products
       set stock = greatest(0, stock - (item->>'quantity')::numeric), "updatedAt" = now()
     where id = item->>'productId'
     returning stock into v_new_stock;

    if found then
      insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason, "refId")
      values (item->>'productId', 'venta',
              -1 * (item->>'quantity')::numeric, coalesce(v_new_stock, 0),
              'Venta ' || v_sale_id, v_sale_id);
    end if;
  end loop;

  if v_pm = 'fiado' and v_customer is not null then
    update public.customers set balance = balance + v_total, "updatedAt" = now() where id = v_customer;
  end if;

  if v_pm = 'efectivo' and v_cash is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (v_cash, 'venta_efectivo', v_total, 'Venta ' || v_sale_id);
  end if;

  return jsonb_build_object('ok', true, 'saleId', v_sale_id);
end;
$$;

-- Ajuste manual de stock (suma/resta) con movimiento auditado.
create or replace function public.adjust_stock(p_product_id text, p_delta numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new_stock numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  update public.products
     set stock = greatest(0, stock + p_delta), "updatedAt" = now()
   where id = p_product_id
   returning stock into v_new_stock;
  if not found then raise exception 'Producto % no encontrado', p_product_id; end if;

  insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason)
  values (p_product_id, 'ajuste', p_delta, v_new_stock, coalesce(p_reason, 'Ajuste manual'));

  return jsonb_build_object('ok', true, 'stock', v_new_stock);
end;
$$;

-- Registra una compra a proveedor: suma stock, actualiza costo, audita y
-- (si queda en cuenta) suma al saldo que se le debe al proveedor.
create or replace function public.register_purchase(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item        jsonb;
  v_new_stock numeric;
  v_id        text := coalesce(nullif(payload->>'id',''), gen_random_uuid()::text);
  v_supplier  text := nullif(payload->>'supplierId','');
  v_paid      boolean := coalesce((payload->>'paid')::boolean, true);
  v_total     numeric := coalesce((payload->>'total')::numeric, 0);
begin
  if not public.is_admin() then raise exception 'Sólo el administrador puede registrar compras'; end if;
  insert into public.purchases (id, timestamp, supplier, "supplierId", items, total, paid, notes)
  values (v_id, now(), nullif(payload->>'supplier',''), v_supplier,
          payload->'items', v_total, v_paid, nullif(payload->>'notes',''));

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    update public.products
       set stock = stock + (item->>'quantity')::numeric,
           "costPrice" = coalesce(nullif(item->>'costPrice','')::numeric, "costPrice"),
           "updatedAt" = now()
     where id = item->>'productId'
     returning stock into v_new_stock;

    if found then
      insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason, "refId")
      values (item->>'productId', 'compra',
              (item->>'quantity')::numeric, coalesce(v_new_stock, 0), 'Compra ' || v_id, v_id);
    end if;
  end loop;

  if not v_paid and v_supplier is not null then
    update public.suppliers set balance = balance + v_total, "updatedAt" = now() where id = v_supplier;
  end if;

  return jsonb_build_object('ok', true, 'purchaseId', v_id);
end;
$$;

-- Pago de un cliente contra su cuenta corriente.
create or replace function public.register_customer_payment(
  p_customer_id text, p_amount numeric, p_method text, p_notes text, p_cash_session text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new_balance numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  insert into public.customer_payments ("customerId", amount, method, notes)
  values (p_customer_id, p_amount, coalesce(p_method, 'efectivo'), nullif(p_notes, ''));

  update public.customers set balance = balance - p_amount, "updatedAt" = now()
   where id = p_customer_id returning balance into v_new_balance;

  if p_method = 'efectivo' and nullif(p_cash_session, '') is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (p_cash_session, 'pago_fiado', p_amount, 'Pago cuenta corriente');
  end if;

  return jsonb_build_object('ok', true, 'balance', v_new_balance);
end;
$$;

-- Pago a un proveedor contra lo que se le debe.
create or replace function public.register_supplier_payment(
  p_supplier_id text, p_amount numeric, p_method text, p_notes text, p_cash_session text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new_balance numeric;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador puede registrar pagos a proveedores'; end if;
  insert into public.supplier_payments ("supplierId", amount, method, notes)
  values (p_supplier_id, p_amount, coalesce(p_method, 'efectivo'), nullif(p_notes, ''));

  update public.suppliers set balance = balance - p_amount, "updatedAt" = now()
   where id = p_supplier_id returning balance into v_new_balance;

  if p_method = 'efectivo' and nullif(p_cash_session, '') is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (p_cash_session, 'pago_proveedor', -1 * p_amount, 'Pago a proveedor');
  end if;

  return jsonb_build_object('ok', true, 'balance', v_new_balance);
end;
$$;

-- Registra un gasto del kiosco (y lo descuenta de caja si es efectivo).
create or replace function public.register_expense(
  p_category text, p_description text, p_amount numeric, p_method text, p_cash_session text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := gen_random_uuid()::text;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador puede registrar gastos'; end if;
  insert into public.expenses (id, date, category, description, amount, "paymentMethod", "cashSessionId")
  values (v_id, now(), coalesce(p_category, 'General'), nullif(p_description, ''),
          p_amount, coalesce(p_method, 'efectivo'), nullif(p_cash_session, ''));

  if p_method = 'efectivo' and nullif(p_cash_session, '') is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (p_cash_session, 'gasto', -1 * p_amount, coalesce(nullif(p_description, ''), p_category));
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Anula una venta: repone stock, revierte saldo de fiado y caja.
create or replace function public.void_sale(p_sale_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sale      public.sales%rowtype;
  item        jsonb;
  v_new_stock numeric;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador puede anular ventas'; end if;
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then raise exception 'Venta % no encontrada', p_sale_id; end if;
  if v_sale.status = 'cancelled' then return jsonb_build_object('ok', true, 'already', true); end if;

  update public.sales set status = 'cancelled',
    notes = trim(both ' ' from coalesce(notes, '') || ' [ANULADA: ' || coalesce(p_reason, 's/motivo') || ']')
   where id = p_sale_id;

  for item in select * from jsonb_array_elements(v_sale.items)
  loop
    update public.products
       set stock = stock + (item->>'quantity')::numeric, "updatedAt" = now()
     where id = item->>'productId'
     returning stock into v_new_stock;
    if found then
      insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason, "refId")
      values (item->>'productId', 'devolucion',
              (item->>'quantity')::numeric, coalesce(v_new_stock, 0), 'Anulación ' || p_sale_id, p_sale_id);
    end if;
  end loop;

  if v_sale."paymentMethod" = 'fiado' and v_sale."customerId" is not null then
    update public.customers set balance = balance - v_sale.total, "updatedAt" = now()
     where id = v_sale."customerId";
  end if;

  if v_sale."paymentMethod" = 'efectivo' and v_sale."cashSessionId" is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (v_sale."cashSessionId", 'retiro', -1 * v_sale.total, 'Anulación venta ' || p_sale_id);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Cierra la caja calculando el efectivo esperado como la suma de sus movimientos
-- (la apertura ya está registrada como un movimiento).
create or replace function public.close_cash_session(p_session_id text, p_counted numeric, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_expected numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from public.cash_sessions where id = p_session_id) then
    raise exception 'Caja % no encontrada', p_session_id;
  end if;

  select coalesce(sum(amount), 0) into v_expected
    from public.cash_movements where "cashSessionId" = p_session_id;

  update public.cash_sessions
     set status = 'closed', "closedAt" = now(),
         "closingCountedAmount" = p_counted, "expectedAmount" = v_expected,
         difference = p_counted - v_expected, notes = nullif(p_notes, '')
   where id = p_session_id;

  return jsonb_build_object('ok', true, 'expected', v_expected, 'difference', p_counted - v_expected);
end;
$$;

-- ============================================================================
-- Estas funciones corren "security definer" (necesitan tocar tablas que el
-- que llama no puede editar directo, p.ej. el vendedor descontando stock de
-- products). Se restringe su ejecución a usuarios logueados únicamente.
-- ============================================================================
revoke all on function
  public.process_sale(jsonb), public.adjust_stock(text, numeric, text),
  public.register_purchase(jsonb), public.register_customer_payment(text, numeric, text, text, text),
  public.register_supplier_payment(text, numeric, text, text, text),
  public.register_expense(text, text, numeric, text, text),
  public.void_sale(text, text), public.close_cash_session(text, numeric, text)
from public, anon;

grant execute on function
  public.process_sale(jsonb), public.adjust_stock(text, numeric, text),
  public.register_purchase(jsonb), public.register_customer_payment(text, numeric, text, text, text),
  public.register_supplier_payment(text, numeric, text, text, text),
  public.register_expense(text, text, numeric, text, text),
  public.void_sale(text, text), public.close_cash_session(text, numeric, text)
to authenticated;
