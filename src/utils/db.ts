// ============================================================================
// Facade de datos. Elige backend automáticamente:
//   - Supabase   si hay credenciales y el schema responde
//   - localStorage  si no hay conexión / faltan las tablas (modo offline)
// Todos los componentes importan SÓLO desde acá.
// ============================================================================
import { supabase, hasSupabaseConfig } from './supabase';
import { localStore, seedIfEmpty, resetAndSeed } from './localStore';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS, DEMO_SUPPLIERS, DEMO_SALES } from './demoData';
import type {
  Product,
  Sale,
  StockMovement,
  Customer,
  CustomerPayment,
  Supplier,
  SupplierPayment,
  Expense,
  CashSession,
  CashMovement,
  Purchase,
} from '../types';

export type BackendMode = 'supabase' | 'local';
let mode: BackendMode = 'local';

export const getBackendMode = (): BackendMode => mode;
export const isRealtimeAvailable = (): boolean => mode === 'supabase';

/** Link de demo (?demo=1): siempre local, siempre arranca limpio, sin PIN —
 *  para mostrar la app sin tocar los datos reales de ningún negocio. No usar
 *  en un dispositivo que ya tenga datos reales guardados en modo local (los
 *  reinicia cada vez que se abre). */
export const isDemoMode = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Modo offline (sólo aplica en modo Supabase): si internet se corta a mitad
// de uso, no volvemos al modo local con datos de prueba — seguimos mostrando
// la última copia real que se pudo bajar, y las ventas que se hagan mientras
// tanto quedan en una cola que se sincroniza sola apenas vuelve la señal.
// ---------------------------------------------------------------------------
const CACHE_PREFIX = 'kioscocontrol:cache:';
const PENDING_SALES_KEY = 'kioscocontrol:pendingSales';

function cacheSet(name: string, data: unknown): void {
  try {
    localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(data));
  } catch {
    /* noop */
  }
}
function cacheGet<T>(name: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + name);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** ¿Este error es "no hay conexión" (a diferencia de un error real del servidor)? */
function isNetworkError(err: any): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('offline');
}

function readPendingRaw(): Omit<Sale, 'status'>[] {
  try {
    const raw = localStorage.getItem(PENDING_SALES_KEY);
    return raw ? (JSON.parse(raw) as Omit<Sale, 'status'>[]) : [];
  } catch {
    return [];
  }
}
function writePendingSales(list: Omit<Sale, 'status'>[]): void {
  try {
    localStorage.setItem(PENDING_SALES_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

/** Aplica el descuento de stock ya mismo en la copia local, para que una
 *  segunda venta offline (antes de sincronizar) no sobrevenda. */
function applyOptimisticStock(sale: Omit<Sale, 'status'>): void {
  const products = cacheGet<Product[]>('products');
  if (!products) return;
  for (const item of sale.items) {
    const p = products.find((x) => x.id === item.productId);
    if (p) p.stock = Math.max(0, p.stock - item.quantity);
  }
  cacheSet('products', products);
  if (sale.paymentMethod === 'fiado' && sale.customerId) {
    const customers = cacheGet<Customer[]>('customers');
    const c = customers?.find((x) => x.id === sale.customerId);
    if (c) {
      c.balance += sale.total;
      cacheSet('customers', customers);
    }
  }
}

/** Cuántas ventas quedaron pendientes de subir a la base central. */
export function pendingSalesCount(): number {
  return readPendingRaw().length;
}

/** Intenta subir las ventas que quedaron guardadas mientras no había señal. */
export async function syncPendingSales(): Promise<{ synced: number; remaining: number }> {
  if (mode !== 'supabase') return { synced: 0, remaining: 0 };
  const queue = readPendingRaw();
  if (queue.length === 0) return { synced: 0, remaining: 0 };
  let synced = 0;
  let i = 0;
  for (; i < queue.length; i++) {
    try {
      const { error } = await supabase.rpc('process_sale', { payload: queue[i] });
      if (error && !/duplicate key|already exists/i.test(error.message)) throw error;
      synced++;
    } catch (err) {
      if (isNetworkError(err)) break; // seguimos sin conexión, el resto queda para después
      console.error('Venta pendiente con error, se descarta:', err); // eslint-disable-line no-console
    }
  }
  const remaining = queue.slice(i);
  writePendingSales(remaining);
  return { synced, remaining: remaining.length };
}

/** ¿Hay datos guardados en el store local de este navegador? */
export function hasLocalData(): boolean {
  try {
    const raw = localStorage.getItem('kioscocontrol:v1');
    if (!raw) return false;
    const db = JSON.parse(raw);
    return (db.products?.length || 0) > 0 || (db.sales?.length || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Sube todo lo que haya en el store local a Supabase (para cuando se trabajó
 * offline y después se configuró la base central). Requiere modo 'supabase'.
 */
export async function migrateLocalToSupabase(): Promise<Record<string, number>> {
  if (mode !== 'supabase') throw new Error('La base central no está activa');
  const raw = localStorage.getItem('kioscocontrol:v1');
  if (!raw) throw new Error('No hay datos locales para subir');
  const local = JSON.parse(raw) as Record<string, any[]>;
  const counts: Record<string, number> = {};

  // Orden respetando las claves foráneas.
  const steps: [string, any[] | undefined, 'upsert' | 'insert'][] = [
    ['products', local.products, 'upsert'],
    ['customers', local.customers, 'upsert'],
    ['suppliers', local.suppliers, 'upsert'],
    ['cash_sessions', local.cash_sessions, 'upsert'],
    ['sales', local.sales, 'upsert'],
    ['stock_movements', local.stock_movements, 'upsert'],
    ['cash_movements', local.cash_movements, 'upsert'],
    ['customer_payments', local.customer_payments, 'upsert'],
    ['supplier_payments', local.supplier_payments, 'upsert'],
    ['expenses', local.expenses, 'upsert'],
    ['purchases', local.purchases, 'upsert'],
  ];

  for (const [table, rows] of steps) {
    if (!rows || rows.length === 0) continue;
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[table] = rows.length;
  }
  return counts;
}

/** Health check al arrancar. Devuelve el modo elegido. */
export async function initBackend(): Promise<BackendMode> {
  if (isDemoMode()) {
    mode = 'local';
    try {
      localStorage.removeItem('kioscocontrol:auth');
      sessionStorage.removeItem('kioscocontrol:session');
    } catch {
      /* noop */
    }
    resetAndSeed(DEMO_PRODUCTS, DEMO_CUSTOMERS, DEMO_SUPPLIERS, DEMO_SALES);
    return mode;
  }
  if (hasSupabaseConfig) {
    try {
      // Verifica el schema NUEVO (no sólo que exista `products`).
      const [prod, cash, exp] = await Promise.all([
        supabase.from('products').select('isActive').limit(1),
        supabase.from('cash_sessions').select('id').limit(1),
        supabase.from('expenses').select('id').limit(1),
      ]);
      if (!prod.error && !cash.error && !exp.error) {
        mode = 'supabase';
        return mode;
      }
      const firstError = prod.error || cash.error || exp.error;
      // Sin conexión (no un problema real de schema/config): si este equipo
      // ya había podido bajar datos antes, nos quedamos en modo Supabase y
      // servimos esa última copia — nunca reemplazarla por datos de prueba.
      if (isNetworkError(firstError) && cacheGet('products')) {
        mode = 'supabase';
        return mode;
      }
      console.warn(
        'Falta aplicar la última versión de schema.sql en Supabase — usando modo local. Detalle:',
        firstError?.message,
      );
    } catch (err) {
      if (isNetworkError(err) && cacheGet('products')) {
        mode = 'supabase';
        return mode;
      }
      console.warn('Supabase inaccesible, usando modo local:', err);
    }
  }
  mode = 'local';
  seedIfEmpty(DEMO_PRODUCTS, DEMO_CUSTOMERS, DEMO_SUPPLIERS, DEMO_SALES);
  return mode;
}

// ---------------------------------------------------------------------------
// Implementación Supabase
// ---------------------------------------------------------------------------
const supa = {
  async fetchProducts(): Promise<Product[]> {
    try {
      const { data, error } = await supabase.from('products').select('*').eq('isActive', true).order('name');
      if (error) throw error;
      const rows = data || [];
      cacheSet('products', rows);
      return rows;
    } catch (err) {
      const cached = isNetworkError(err) ? cacheGet<Product[]>('products') : null;
      if (cached) return cached;
      throw err;
    }
  },

  async saveProduct(product: Partial<Product>): Promise<void> {
    const isEdit = !!product.id;
    const id = isEdit ? product.id! : `prod-${Date.now()}`;
    const nowISO = new Date().toISOString();
    const { error } = await supabase.from('products').upsert({
      ...product,
      id,
      isActive: product.isActive ?? true,
      updatedAt: nowISO,
      ...(isEdit ? {} : { createdAt: nowISO }),
    });
    if (error) throw new Error(error.message || 'Error guardando producto');
    if (!isEdit && product.stock && product.stock > 0) {
      await supabase.from('stock_movements').insert({
        productId: id,
        type: 'alta',
        quantity: product.stock,
        stockAfter: product.stock,
        reason: 'Alta de producto',
      });
    }
  },

  async deactivateProduct(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({ isActive: false, updatedAt: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message || 'Error al eliminar producto');
  },

  async adjustStock(productId: string, delta: number, reason: string): Promise<void> {
    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: productId,
      p_delta: delta,
      p_reason: reason,
    });
    if (error) throw new Error(error.message || 'Error ajustando stock');
  },

  async processSale(sale: Omit<Sale, 'status'>): Promise<void> {
    try {
      const { error } = await supabase.rpc('process_sale', { payload: sale });
      if (error) throw error;
    } catch (err) {
      if (!isNetworkError(err)) throw new Error((err as any)?.message || 'No se pudo procesar la venta');
      // Sin conexión: la guardamos para subir apenas vuelva la señal, y
      // descontamos el stock ya mismo en la copia local para no sobrevender.
      const queue = readPendingRaw();
      queue.push(sale);
      writePendingSales(queue);
      applyOptimisticStock(sale);
    }
  },

  async voidSale(saleId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('void_sale', { p_sale_id: saleId, p_reason: reason });
    if (error) throw new Error(error.message || 'No se pudo anular la venta');
  },

  async fetchSales(fromISO?: string, toISO?: string): Promise<Sale[]> {
    let q = supabase.from('sales').select('*').order('timestamp', { ascending: false });
    if (fromISO) q = q.gte('timestamp', fromISO);
    if (toISO) q = q.lte('timestamp', toISO);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as Sale[];
  },

  async fetchStockMovements(productId?: string, limit = 100): Promise<StockMovement[]> {
    let q = supabase
      .from('stock_movements')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(limit);
    if (productId) q = q.eq('productId', productId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as StockMovement[];
  },

  async registerPurchase(purchase: Omit<Purchase, 'id' | 'timestamp'>): Promise<void> {
    const { error } = await supabase.rpc('register_purchase', { payload: purchase });
    if (error) throw new Error(error.message || 'No se pudo registrar la compra');
  },

  async fetchPurchases(limit = 50): Promise<Purchase[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as Purchase[];
  },

  async fetchCustomers(): Promise<Customer[]> {
    try {
      const { data, error } = await supabase.from('customers').select('*').order('name');
      if (error) throw error;
      const rows = (data || []) as Customer[];
      cacheSet('customers', rows);
      return rows;
    } catch (err) {
      const cached = isNetworkError(err) ? cacheGet<Customer[]>('customers') : null;
      if (cached) return cached;
      throw new Error((err as any)?.message || String(err));
    }
  },

  async saveCustomer(customer: Partial<Customer>): Promise<Customer> {
    const payload = {
      ...customer,
      id: customer.id || `cust-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('customers').upsert(payload).select().single();
    if (error) throw new Error(error.message || 'Error guardando cliente');
    return data as Customer;
  },

  async deleteCustomer(id: string): Promise<void> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async fetchCustomerPayments(customerId: string): Promise<CustomerPayment[]> {
    const { data, error } = await supabase
      .from('customer_payments')
      .select('*')
      .eq('customerId', customerId)
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as CustomerPayment[];
  },

  async registerCustomerPayment(
    customerId: string,
    amount: number,
    method: string,
    notes: string,
    cashSessionId: string | null,
  ): Promise<void> {
    const { error } = await supabase.rpc('register_customer_payment', {
      p_customer_id: customerId,
      p_amount: amount,
      p_method: method,
      p_notes: notes,
      p_cash_session: cashSessionId,
    });
    if (error) throw new Error(error.message || 'No se pudo registrar el pago');
  },

  // ----- Proveedores -----
  async fetchSuppliers(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      const rows = (data || []) as Supplier[];
      cacheSet('suppliers', rows);
      return rows;
    } catch (err) {
      const cached = isNetworkError(err) ? cacheGet<Supplier[]>('suppliers') : null;
      if (cached) return cached;
      throw new Error((err as any)?.message || String(err));
    }
  },

  async saveSupplier(supplier: Partial<Supplier>): Promise<Supplier> {
    const payload = {
      ...supplier,
      id: supplier.id || `sup-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('suppliers').upsert(payload).select().single();
    if (error) throw new Error(error.message || 'Error guardando proveedor');
    return data as Supplier;
  },

  async deleteSupplier(id: string): Promise<void> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async fetchSupplierPayments(supplierId: string): Promise<SupplierPayment[]> {
    const { data, error } = await supabase
      .from('supplier_payments')
      .select('*')
      .eq('supplierId', supplierId)
      .order('createdAt', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as SupplierPayment[];
  },

  async registerSupplierPayment(
    supplierId: string,
    amount: number,
    method: string,
    notes: string,
    cashSessionId: string | null,
  ): Promise<void> {
    const { error } = await supabase.rpc('register_supplier_payment', {
      p_supplier_id: supplierId,
      p_amount: amount,
      p_method: method,
      p_notes: notes,
      p_cash_session: cashSessionId,
    });
    if (error) throw new Error(error.message || 'No se pudo registrar el pago');
  },

  // ----- Gastos -----
  async fetchExpenses(fromISO?: string, toISO?: string): Promise<Expense[]> {
    let q = supabase.from('expenses').select('*').order('date', { ascending: false });
    if (fromISO) q = q.gte('date', fromISO);
    if (toISO) q = q.lte('date', toISO);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as Expense[];
  },

  async registerExpense(
    category: string,
    description: string,
    amount: number,
    method: string,
    cashSessionId: string | null,
  ): Promise<void> {
    const { error } = await supabase.rpc('register_expense', {
      p_category: category,
      p_description: description,
      p_amount: amount,
      p_method: method,
      p_cash_session: cashSessionId,
    });
    if (error) throw new Error(error.message || 'No se pudo registrar el gasto');
  },

  async deleteExpense(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async fetchOpenCashSession(): Promise<CashSession | null> {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('status', 'open')
        .order('openedAt', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data && data[0]) || null;
      cacheSet('cashSession', row);
      return row;
    } catch (err) {
      if (isNetworkError(err)) return cacheGet<CashSession | null>('cashSession') ?? null;
      throw new Error((err as any)?.message || String(err));
    }
  },

  async fetchCashSessions(limit = 30): Promise<CashSession[]> {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .order('openedAt', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as CashSession[];
  },

  async openCashSession(openingAmount: number, notes: string): Promise<CashSession> {
    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({ openingAmount, notes: notes || null, status: 'open' })
      .select()
      .single();
    if (error) throw new Error(error.message || 'No se pudo abrir la caja');
    await supabase.from('cash_movements').insert({
      cashSessionId: data.id,
      type: 'apertura',
      amount: openingAmount,
      reason: 'Apertura de caja',
    });
    return data as CashSession;
  },

  async addCashMovement(
    cashSessionId: string,
    type: 'ingreso' | 'retiro',
    amount: number,
    reason: string,
  ): Promise<void> {
    const signed = type === 'retiro' ? -Math.abs(amount) : Math.abs(amount);
    const { error } = await supabase
      .from('cash_movements')
      .insert({ cashSessionId, type, amount: signed, reason: reason || null });
    if (error) throw new Error(error.message);
  },

  async fetchCashMovements(cashSessionId: string): Promise<CashMovement[]> {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('cashSessionId', cashSessionId)
      .order('createdAt', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []) as CashMovement[];
  },

  async closeCashSession(
    sessionId: string,
    countedAmount: number,
    notes: string,
  ): Promise<{ expected: number; difference: number }> {
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id: sessionId,
      p_counted: countedAmount,
      p_notes: notes,
    });
    if (error) throw new Error(error.message || 'No se pudo cerrar la caja');
    return { expected: data.expected, difference: data.difference };
  },
};

// ---------------------------------------------------------------------------
// Dispatch — cada función delega en el backend activo
// ---------------------------------------------------------------------------
const pick = () => (mode === 'supabase' ? supa : localStore);

export const fetchProducts = () => pick().fetchProducts();
export const saveProduct = (p: Partial<Product>) => pick().saveProduct(p);
export const deactivateProduct = (id: string) => pick().deactivateProduct(id);
export const adjustStock = (id: string, d: number, r: string) => pick().adjustStock(id, d, r);

export const processSale = (s: Omit<Sale, 'status'>) => pick().processSale(s);
export const voidSale = (saleId: string, reason: string) => pick().voidSale(saleId, reason);
export const fetchSales = (from?: string, to?: string) => pick().fetchSales(from, to);

export const fetchStockMovements = (productId?: string, limit?: number) =>
  pick().fetchStockMovements(productId, limit);

export const registerPurchase = (p: Omit<Purchase, 'id' | 'timestamp'>) => pick().registerPurchase(p);
export const fetchPurchases = (limit?: number) => pick().fetchPurchases(limit);

export const fetchCustomers = () => pick().fetchCustomers();
export const saveCustomer = (c: Partial<Customer>) => pick().saveCustomer(c);
export const deleteCustomer = (id: string) => pick().deleteCustomer(id);
export const fetchCustomerPayments = (id: string) => pick().fetchCustomerPayments(id);
export const registerCustomerPayment = (
  id: string,
  amount: number,
  method: string,
  notes: string,
  cashSessionId: string | null,
) => pick().registerCustomerPayment(id, amount, method, notes, cashSessionId);

export const fetchSuppliers = () => pick().fetchSuppliers();
export const saveSupplier = (s: Partial<Supplier>) => pick().saveSupplier(s);
export const deleteSupplier = (id: string) => pick().deleteSupplier(id);
export const fetchSupplierPayments = (id: string) => pick().fetchSupplierPayments(id);
export const registerSupplierPayment = (
  id: string,
  amount: number,
  method: string,
  notes: string,
  cashSessionId: string | null,
) => pick().registerSupplierPayment(id, amount, method, notes, cashSessionId);

export const fetchExpenses = (from?: string, to?: string) => pick().fetchExpenses(from, to);
export const registerExpense = (
  category: string,
  description: string,
  amount: number,
  method: string,
  cashSessionId: string | null,
) => pick().registerExpense(category, description, amount, method, cashSessionId);
export const deleteExpense = (id: string) => pick().deleteExpense(id);

export const fetchOpenCashSession = () => pick().fetchOpenCashSession();
export const fetchCashSessions = (limit?: number) => pick().fetchCashSessions(limit);
export const openCashSession = (amount: number, notes: string) => pick().openCashSession(amount, notes);
export const addCashMovement = (
  sessionId: string,
  type: 'ingreso' | 'retiro',
  amount: number,
  reason: string,
) => pick().addCashMovement(sessionId, type, amount, reason);
export const fetchCashMovements = (sessionId: string) => pick().fetchCashMovements(sessionId);
export const closeCashSession = (sessionId: string, counted: number, notes: string) =>
  pick().closeCashSession(sessionId, counted, notes);
