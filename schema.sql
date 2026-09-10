-- ============================================================================
-- KioscoControl — Esquema completo
-- Ejecutar en el SQL Editor del Dashboard de Supabase (una sola vez).
-- Es idempotente: se puede volver a correr para actualizar funciones.
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
  stock       integer not null default 0,
  "minStock"  integer not null default 5,
  unit        text default 'unidad',
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
  quantity     integer not null,       -- firmado
  "stockAfter" integer not null,
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
  type            text not null,   -- apertura | ingreso | retiro | venta_efectivo | pago_fiado
  amount          numeric not null,
  reason          text,
  "createdAt"     timestamptz not null default now()
);
create index if not exists cash_movements_session_idx on public.cash_movements ("cashSessionId", "createdAt");

-- ----------------------------------------------------------------------------
-- Compras a proveedor
-- ----------------------------------------------------------------------------
create table if not exists public.purchases (
  id          text primary key default gen_random_uuid()::text,
  timestamp   timestamptz not null default now(),
  supplier    text,
  items       jsonb not null,
  total       numeric not null default 0,
  notes       text
);

-- ============================================================================
-- RLS — acceso anónimo total (kiosco de confianza, un solo dispositivo).
-- Si querés multiusuario con login, reemplazá estas policies por auth.uid().
-- ============================================================================
alter table public.products         enable row level security;
alter table public.sales            enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.customers        enable row level security;
alter table public.customer_payments enable row level security;
alter table public.cash_sessions    enable row level security;
alter table public.cash_movements   enable row level security;
alter table public.purchases        enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'products','sales','stock_movements','customers','customer_payments',
    'cash_sessions','cash_movements','purchases'
  ]
  loop
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$s;', t);
    execute format(
      'create policy "anon_all_%1$s" on public.%1$s for all using (true) with check (true);', t);
  end loop;
end $$;

-- ============================================================================
-- Realtime
-- ============================================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.products'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.sales'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.customers'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.cash_sessions'; exception when others then null; end;
end $$;

-- ============================================================================
-- FUNCIONES RPC — operaciones atómicas
-- ============================================================================

-- Registra una venta: inserta la venta, descuenta stock con movimientos,
-- actualiza saldo del cliente si es fiado y suma a caja si es efectivo.
create or replace function public.process_sale(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  item          jsonb;
  v_new_stock   integer;
  v_sale_id     text := payload->>'id';
  v_pm          text := payload->>'paymentMethod';
  v_cash        text := nullif(payload->>'cashSessionId', '');
  v_customer    text := nullif(payload->>'customerId', '');
  v_total       numeric := (payload->>'total')::numeric;
begin
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
       set stock = greatest(0, stock - (item->>'quantity')::integer),
           "updatedAt" = now()
     where id = item->>'productId'
     returning stock into v_new_stock;

    insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason, "refId")
    values (item->>'productId', 'venta',
            -1 * (item->>'quantity')::integer,
            coalesce(v_new_stock, 0),
            'Venta ' || v_sale_id, v_sale_id);
  end loop;

  if v_pm = 'fiado' and v_customer is not null then
    update public.customers
       set balance = balance + v_total, "updatedAt" = now()
     where id = v_customer;
  end if;

  if v_pm = 'efectivo' and v_cash is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (v_cash, 'venta_efectivo', v_total, 'Venta ' || v_sale_id);
  end if;

  return jsonb_build_object('ok', true, 'saleId', v_sale_id);
end;
$$;

-- Ajuste manual de stock (suma/resta) con movimiento auditado.
create or replace function public.adjust_stock(p_product_id text, p_delta integer, p_reason text)
returns jsonb
language plpgsql
as $$
declare v_new_stock integer;
begin
  update public.products
     set stock = greatest(0, stock + p_delta), "updatedAt" = now()
   where id = p_product_id
   returning stock into v_new_stock;

  if not found then
    raise exception 'Producto % no encontrado', p_product_id;
  end if;

  insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason)
  values (p_product_id,
          case when p_delta >= 0 then 'ajuste' else 'ajuste' end,
          p_delta, v_new_stock, coalesce(p_reason, 'Ajuste manual'));

  return jsonb_build_object('ok', true, 'stock', v_new_stock);
end;
$$;

-- Registra una compra a proveedor: suma stock, actualiza costo y audita.
create or replace function public.register_purchase(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  item        jsonb;
  v_new_stock integer;
  v_id        text := coalesce(nullif(payload->>'id',''), gen_random_uuid()::text);
begin
  insert into public.purchases (id, timestamp, supplier, items, total, notes)
  values (v_id, now(), nullif(payload->>'supplier',''), payload->'items',
          coalesce((payload->>'total')::numeric, 0), nullif(payload->>'notes',''));

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    update public.products
       set stock = stock + (item->>'quantity')::integer,
           "costPrice" = coalesce(nullif(item->>'costPrice','')::numeric, "costPrice"),
           "updatedAt" = now()
     where id = item->>'productId'
     returning stock into v_new_stock;

    insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason, "refId")
    values (item->>'productId', 'compra',
            (item->>'quantity')::integer, coalesce(v_new_stock, 0),
            'Compra ' || v_id, v_id);
  end loop;

  return jsonb_build_object('ok', true, 'purchaseId', v_id);
end;
$$;

-- Registra un pago de un cliente contra su cuenta corriente.
create or replace function public.register_customer_payment(
  p_customer_id text, p_amount numeric, p_method text, p_notes text, p_cash_session text
)
returns jsonb
language plpgsql
as $$
declare v_new_balance numeric;
begin
  insert into public.customer_payments ("customerId", amount, method, notes)
  values (p_customer_id, p_amount, coalesce(p_method, 'efectivo'), nullif(p_notes, ''));

  update public.customers
     set balance = balance - p_amount, "updatedAt" = now()
   where id = p_customer_id
   returning balance into v_new_balance;

  if p_method = 'efectivo' and nullif(p_cash_session, '') is not null then
    insert into public.cash_movements ("cashSessionId", type, amount, reason)
    values (p_cash_session, 'pago_fiado', p_amount, 'Pago cuenta corriente');
  end if;

  return jsonb_build_object('ok', true, 'balance', v_new_balance);
end;
$$;

-- Anula una venta: repone stock, revierte saldo de fiado y caja.
create or replace function public.void_sale(p_sale_id text, p_reason text)
returns jsonb
language plpgsql
as $$
declare
  v_sale      public.sales%rowtype;
  item        jsonb;
  v_new_stock integer;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then raise exception 'Venta % no encontrada', p_sale_id; end if;
  if v_sale.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.sales set status = 'cancelled',
    notes = trim(both ' ' from coalesce(notes, '') || ' [ANULADA: ' || coalesce(p_reason, 's/motivo') || ']')
   where id = p_sale_id;

  for item in select * from jsonb_array_elements(v_sale.items)
  loop
    update public.products
       set stock = stock + (item->>'quantity')::integer, "updatedAt" = now()
     where id = item->>'productId'
     returning stock into v_new_stock;

    insert into public.stock_movements ("productId", type, quantity, "stockAfter", reason, "refId")
    values (item->>'productId', 'devolucion',
            (item->>'quantity')::integer, coalesce(v_new_stock, 0),
            'Anulación ' || p_sale_id, p_sale_id);
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

-- Cierra la caja abierta calculando el esperado a partir de sus movimientos.
create or replace function public.close_cash_session(p_session_id text, p_counted numeric, p_notes text)
returns jsonb
language plpgsql
as $$
declare
  v_opening  numeric;
  v_moves    numeric;
  v_expected numeric;
begin
  select "openingAmount" into v_opening from public.cash_sessions where id = p_session_id;
  if not found then raise exception 'Caja % no encontrada', p_session_id; end if;

  select coalesce(sum(amount), 0) into v_moves
    from public.cash_movements where "cashSessionId" = p_session_id;

  v_expected := v_opening + v_moves;

  update public.cash_sessions
     set status = 'closed',
         "closedAt" = now(),
         "closingCountedAmount" = p_counted,
         "expectedAmount" = v_expected,
         difference = p_counted - v_expected,
         notes = nullif(p_notes, '')
   where id = p_session_id;

  return jsonb_build_object('ok', true, 'expected', v_expected, 'difference', p_counted - v_expected);
end;
$$;
