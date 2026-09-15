// ============================================================================
// Backend local (localStorage) — misma semántica que las funciones RPC de
// Supabase. Se usa cuando no hay conexión / el schema no está aplicado.
// Single-device, pero 100% funcional y offline.
// ============================================================================
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

const KEY = 'kioscocontrol:v1';

interface DB {
  products: Product[];
  sales: Sale[];
  stock_movements: StockMovement[];
  customers: Customer[];
  customer_payments: CustomerPayment[];
  suppliers: Supplier[];
  supplier_payments: SupplierPayment[];
  expenses: Expense[];
  cash_sessions: CashSession[];
  cash_movements: CashMovement[];
  purchases: Purchase[];
}

const empty = (): DB => ({
  products: [],
  sales: [],
  stock_movements: [],
  customers: [],
  customer_payments: [],
  suppliers: [],
  supplier_payments: [],
  expenses: [],
  cash_sessions: [],
  cash_movements: [],
  purchases: [],
});

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

function save(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (err) {
    console.error('No se pudo guardar en localStorage', err);
  }
}

const uid = (p = 'id') => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const nowISO = () => new Date().toISOString();

// Sembrado inicial la primera vez (para que la demo no arranque vacía).
export function seedIfEmpty(
  products: Product[],
  customers: Customer[],
  suppliers: Supplier[] = [],
  sales: Sale[] = [],
) {
  const db = load();
  if (db.products.length === 0) {
    db.products = products;
    db.customers = customers;
    db.suppliers = suppliers;
    db.sales = sales;
    save(db);
  }
}

/** Igual que seedIfEmpty pero siempre arranca de cero (para el link de demo:
 *  cada vez que se abre, vuelve a este estado inicial, sin arrastrar lo que
 *  se haya tocado en una demo anterior). */
export function resetAndSeed(
  products: Product[],
  customers: Customer[],
  suppliers: Supplier[] = [],
  sales: Sale[] = [],
) {
  save({ ...empty(), products, customers, suppliers, sales });
}

export const localStore = {
  // ----- Productos -----
  async fetchProducts(): Promise<Product[]> {
    return load()
      .products.filter((p) => p.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async saveProduct(product: Partial<Product>): Promise<void> {
    const db = load();
    const isEdit = !!product.id && db.products.some((p) => p.id === product.id);
    const id = product.id || uid('prod');
    const ts = nowISO();
    if (isEdit) {
      db.products = db.products.map((p) =>
        p.id === id ? { ...p, ...product, id, updatedAt: ts } : p,
      );
    } else {
      const created = {
        isActive: true,
        stock: 0,
        minStock: 5,
        costPrice: 0,
        sellPrice: 0,
        category: 'Varios',
        ...product,
        id,
        createdAt: ts,
        updatedAt: ts,
      } as Product;
      db.products.push(created);
      if (created.stock > 0) {
        db.stock_movements.push({
          id: uid('mov'),
          productId: id,
          type: 'alta',
          quantity: created.stock,
          stockAfter: created.stock,
          reason: 'Alta de producto',
          createdAt: ts,
        });
      }
    }
    save(db);
  },

  async deactivateProduct(id: string): Promise<void> {
    const db = load();
    db.products = db.products.map((p) => (p.id === id ? { ...p, isActive: false } : p));
    save(db);
  },

  async adjustStock(productId: string, delta: number, reason: string): Promise<void> {
    const db = load();
    const prod = db.products.find((p) => p.id === productId);
    if (!prod) throw new Error('Producto no encontrado');
    prod.stock = Math.max(0, prod.stock + delta);
    prod.updatedAt = nowISO();
    db.stock_movements.push({
      id: uid('mov'),
      productId,
      type: 'ajuste',
      quantity: delta,
      stockAfter: prod.stock,
      reason: reason || 'Ajuste manual',
      createdAt: nowISO(),
    });
    save(db);
  },

  // ----- Ventas -----
  async processSale(sale: Omit<Sale, 'status'>): Promise<void> {
    const db = load();
    db.sales.push({ ...sale, status: 'completed' });

    for (const item of sale.items) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        prod.updatedAt = nowISO();
        db.stock_movements.push({
          id: uid('mov'),
          productId: item.productId,
          type: 'venta',
          quantity: -item.quantity,
          stockAfter: prod.stock,
          reason: `Venta ${sale.id}`,
          refId: sale.id,
          createdAt: sale.timestamp,
        });
      }
    }

    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      const c = db.customers.find((x) => x.id === sale.customerId);
      if (c) {
        c.balance += sale.total;
        c.updatedAt = nowISO();
      }
    }

    if (sale.paymentMethod === 'efectivo' && sale.cashSessionId) {
      db.cash_movements.push({
        id: uid('cm'),
        cashSessionId: sale.cashSessionId,
        type: 'venta_efectivo',
        amount: sale.total,
        reason: `Venta ${sale.id}`,
        createdAt: nowISO(),
      });
    }
    save(db);
  },

  async voidSale(saleId: string, reason: string): Promise<void> {
    const db = load();
    const sale = db.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error('Venta no encontrada');
    if (sale.status === 'cancelled') return;
    sale.status = 'cancelled';
    sale.notes = `${sale.notes || ''} [ANULADA: ${reason || 's/motivo'}]`.trim();

    for (const item of sale.items) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock += item.quantity;
        prod.updatedAt = nowISO();
        db.stock_movements.push({
          id: uid('mov'),
          productId: item.productId,
          type: 'devolucion',
          quantity: item.quantity,
          stockAfter: prod.stock,
          reason: `Anulación ${saleId}`,
          refId: saleId,
          createdAt: nowISO(),
        });
      }
    }
    if (sale.paymentMethod === 'fiado' && sale.customerId) {
      const c = db.customers.find((x) => x.id === sale.customerId);
      if (c) c.balance -= sale.total;
    }
    if (sale.paymentMethod === 'efectivo' && sale.cashSessionId) {
      db.cash_movements.push({
        id: uid('cm'),
        cashSessionId: sale.cashSessionId,
        type: 'retiro',
        amount: -sale.total,
        reason: `Anulación venta ${saleId}`,
        createdAt: nowISO(),
      });
    }
    save(db);
  },

  async fetchSales(fromISO?: string, toISO?: string): Promise<Sale[]> {
    return load()
      .sales.filter((s) => {
        if (fromISO && s.timestamp < fromISO) return false;
        if (toISO && s.timestamp > toISO) return false;
        return true;
      })
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  },

  // ----- Movimientos -----
  async fetchStockMovements(productId?: string, limit = 100): Promise<StockMovement[]> {
    return load()
      .stock_movements.filter((m) => !productId || m.productId === productId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  },

  // ----- Compras -----
  async registerPurchase(purchase: Omit<Purchase, 'id' | 'timestamp'>): Promise<void> {
    const db = load();
    const id = uid('buy');
    const ts = nowISO();
    const paid = purchase.paid ?? true;
    db.purchases.push({ ...purchase, id, timestamp: ts, paid });
    for (const item of purchase.items) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock += item.quantity;
        if (item.costPrice > 0) prod.costPrice = item.costPrice;
        prod.updatedAt = ts;
        db.stock_movements.push({
          id: uid('mov'),
          productId: item.productId,
          type: 'compra',
          quantity: item.quantity,
          stockAfter: prod.stock,
          reason: `Compra ${id}`,
          refId: id,
          createdAt: ts,
        });
      }
    }
    if (!paid && purchase.supplierId) {
      const s = db.suppliers.find((x) => x.id === purchase.supplierId);
      if (s) {
        s.balance += purchase.total;
        s.updatedAt = ts;
      }
    }
    save(db);
  },

  async fetchPurchases(limit = 50): Promise<Purchase[]> {
    return load()
      .purchases.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, limit);
  },

  // ----- Clientes -----
  async fetchCustomers(): Promise<Customer[]> {
    return load().customers.sort((a, b) => a.name.localeCompare(b.name));
  },

  async saveCustomer(customer: Partial<Customer>): Promise<Customer> {
    const db = load();
    const id = customer.id || uid('cust');
    const existing = db.customers.find((c) => c.id === id);
    const ts = nowISO();
    let result: Customer;
    if (existing) {
      result = { ...existing, ...customer, id, updatedAt: ts };
      db.customers = db.customers.map((c) => (c.id === id ? result : c));
    } else {
      result = { balance: 0, ...customer, id, name: customer.name || 'Cliente', createdAt: ts, updatedAt: ts };
      db.customers.push(result);
    }
    save(db);
    return result;
  },

  async deleteCustomer(id: string): Promise<void> {
    const db = load();
    db.customers = db.customers.filter((c) => c.id !== id);
    save(db);
  },

  async fetchCustomerPayments(customerId: string): Promise<CustomerPayment[]> {
    return load()
      .customer_payments.filter((p) => p.customerId === customerId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async registerCustomerPayment(
    customerId: string,
    amount: number,
    method: string,
    notes: string,
    cashSessionId: string | null,
  ): Promise<void> {
    const db = load();
    db.customer_payments.push({
      id: uid('pay'),
      customerId,
      amount,
      method: method as CustomerPayment['method'],
      notes: notes || null,
      createdAt: nowISO(),
    });
    const c = db.customers.find((x) => x.id === customerId);
    if (c) {
      c.balance -= amount;
      c.updatedAt = nowISO();
    }
    if (method === 'efectivo' && cashSessionId) {
      db.cash_movements.push({
        id: uid('cm'),
        cashSessionId,
        type: 'pago_fiado',
        amount,
        reason: 'Pago cuenta corriente',
        createdAt: nowISO(),
      });
    }
    save(db);
  },

  // ----- Proveedores -----
  async fetchSuppliers(): Promise<Supplier[]> {
    return load().suppliers.sort((a, b) => a.name.localeCompare(b.name));
  },

  async saveSupplier(supplier: Partial<Supplier>): Promise<Supplier> {
    const db = load();
    const id = supplier.id || uid('sup');
    const existing = db.suppliers.find((s) => s.id === id);
    const ts = nowISO();
    let result: Supplier;
    if (existing) {
      result = { ...existing, ...supplier, id, updatedAt: ts };
      db.suppliers = db.suppliers.map((s) => (s.id === id ? result : s));
    } else {
      result = { balance: 0, ...supplier, id, name: supplier.name || 'Proveedor', createdAt: ts, updatedAt: ts };
      db.suppliers.push(result);
    }
    save(db);
    return result;
  },

  async deleteSupplier(id: string): Promise<void> {
    const db = load();
    db.suppliers = db.suppliers.filter((s) => s.id !== id);
    save(db);
  },

  async fetchSupplierPayments(supplierId: string): Promise<SupplierPayment[]> {
    return load()
      .supplier_payments.filter((p) => p.supplierId === supplierId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async registerSupplierPayment(
    supplierId: string,
    amount: number,
    method: string,
    notes: string,
    cashSessionId: string | null,
  ): Promise<void> {
    const db = load();
    db.supplier_payments.push({
      id: uid('spay'),
      supplierId,
      amount,
      method: method as SupplierPayment['method'],
      notes: notes || null,
      createdAt: nowISO(),
    });
    const s = db.suppliers.find((x) => x.id === supplierId);
    if (s) {
      s.balance -= amount;
      s.updatedAt = nowISO();
    }
    if (method === 'efectivo' && cashSessionId) {
      db.cash_movements.push({
        id: uid('cm'),
        cashSessionId,
        type: 'pago_proveedor',
        amount: -amount,
        reason: 'Pago a proveedor',
        createdAt: nowISO(),
      });
    }
    save(db);
  },

  // ----- Gastos -----
  async fetchExpenses(fromISO?: string, toISO?: string): Promise<Expense[]> {
    return load()
      .expenses.filter((e) => {
        if (fromISO && e.date < fromISO) return false;
        if (toISO && e.date > toISO) return false;
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  async registerExpense(
    category: string,
    description: string,
    amount: number,
    method: string,
    cashSessionId: string | null,
  ): Promise<void> {
    const db = load();
    const ts = nowISO();
    db.expenses.push({
      id: uid('exp'),
      date: ts,
      category: category || 'General',
      description: description || null,
      amount,
      paymentMethod: method as Expense['paymentMethod'],
      cashSessionId: cashSessionId || null,
      createdAt: ts,
    });
    if (method === 'efectivo' && cashSessionId) {
      db.cash_movements.push({
        id: uid('cm'),
        cashSessionId,
        type: 'gasto',
        amount: -amount,
        reason: description || category,
        createdAt: ts,
      });
    }
    save(db);
  },

  async deleteExpense(id: string): Promise<void> {
    const db = load();
    db.expenses = db.expenses.filter((e) => e.id !== id);
    save(db);
  },

  // ----- Caja -----
  async fetchOpenCashSession(): Promise<CashSession | null> {
    return load().cash_sessions.find((s) => s.status === 'open') || null;
  },

  async fetchCashSessions(limit = 30): Promise<CashSession[]> {
    return load()
      .cash_sessions.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
      .slice(0, limit);
  },

  async openCashSession(openingAmount: number, notes: string): Promise<CashSession> {
    const db = load();
    const session: CashSession = {
      id: uid('cash'),
      openedAt: nowISO(),
      openingAmount,
      notes: notes || null,
      status: 'open',
    };
    db.cash_sessions.push(session);
    db.cash_movements.push({
      id: uid('cm'),
      cashSessionId: session.id,
      type: 'apertura',
      amount: openingAmount,
      reason: 'Apertura de caja',
      createdAt: session.openedAt,
    });
    save(db);
    return session;
  },

  async addCashMovement(
    cashSessionId: string,
    type: 'ingreso' | 'retiro',
    amount: number,
    reason: string,
  ): Promise<void> {
    const db = load();
    db.cash_movements.push({
      id: uid('cm'),
      cashSessionId,
      type,
      amount: type === 'retiro' ? -Math.abs(amount) : Math.abs(amount),
      reason: reason || null,
      createdAt: nowISO(),
    });
    save(db);
  },

  async fetchCashMovements(cashSessionId: string): Promise<CashMovement[]> {
    return load()
      .cash_movements.filter((m) => m.cashSessionId === cashSessionId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  },

  async closeCashSession(
    sessionId: string,
    countedAmount: number,
    notes: string,
  ): Promise<{ expected: number; difference: number }> {
    const db = load();
    const session = db.cash_sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Caja no encontrada');
    const expected = db.cash_movements
      .filter((m) => m.cashSessionId === sessionId)
      .reduce((acc, m) => acc + m.amount, 0);
    session.status = 'closed';
    session.closedAt = nowISO();
    session.closingCountedAmount = countedAmount;
    session.expectedAmount = expected;
    session.difference = countedAmount - expected;
    session.notes = notes || null;
    save(db);
    return { expected, difference: countedAmount - expected };
  },
};
