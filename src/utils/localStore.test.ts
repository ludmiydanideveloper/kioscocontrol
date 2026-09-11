import { describe, it, expect, beforeEach } from 'vitest';
import { localStore, seedIfEmpty } from './localStore';
import type { Product, Sale } from '../types';

const prod = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  barcode: '111',
  name: 'Coca 500',
  category: 'Bebidas',
  costPrice: 800,
  sellPrice: 1400,
  stock: 10,
  minStock: 3,
  isActive: true,
  ...over,
});

const sale = (items: Sale['items'], over: Partial<Sale> = {}): Omit<Sale, 'status'> => ({
  id: 'sale-1',
  timestamp: new Date().toISOString(),
  items,
  subtotal: items.reduce((a, i) => a + i.subtotal, 0),
  discount: 0,
  total: items.reduce((a, i) => a + i.subtotal, 0),
  totalCost: items.reduce((a, i) => a + i.costPrice * i.quantity, 0),
  profit: 0,
  paymentMethod: 'efectivo',
  cashSessionId: null,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('localStore — inventario', () => {
  it('seedIfEmpty carga sólo si está vacío', async () => {
    seedIfEmpty([prod()], []);
    seedIfEmpty([prod({ id: 'p2' }), prod({ id: 'p3' })], []);
    expect((await localStore.fetchProducts()).length).toBe(1);
  });

  it('alta de producto con stock genera un movimiento', async () => {
    await localStore.saveProduct(prod({ id: undefined, stock: 5 }));
    const movs = await localStore.fetchStockMovements();
    expect(movs).toHaveLength(1);
    expect(movs[0].type).toBe('alta');
    expect(movs[0].quantity).toBe(5);
  });

  it('adjustStock nunca deja el stock negativo', async () => {
    await localStore.saveProduct(prod({ stock: 2 }));
    await localStore.adjustStock('p1', -10, 'merma');
    expect((await localStore.fetchProducts())[0].stock).toBe(0);
  });

  it('deactivateProduct lo oculta pero conserva el registro', async () => {
    await localStore.saveProduct(prod());
    await localStore.deactivateProduct('p1');
    expect(await localStore.fetchProducts()).toHaveLength(0);
  });
});

describe('localStore — ventas', () => {
  it('descuenta stock, audita el movimiento y suma a caja', async () => {
    seedIfEmpty([prod({ stock: 10 })], []);
    const session = await localStore.openCashSession(1000, '');
    await localStore.processSale(
      sale([{ productId: 'p1', barcode: '111', name: 'Coca 500', quantity: 3, unitPrice: 1400, costPrice: 800, subtotal: 4200 }], {
        cashSessionId: session.id,
      }),
    );

    expect((await localStore.fetchProducts())[0].stock).toBe(7);

    const movs = await localStore.fetchStockMovements('p1');
    expect(movs[0].type).toBe('venta');
    expect(movs[0].quantity).toBe(-3);

    const cash = await localStore.fetchCashMovements(session.id);
    expect(cash.find((m) => m.type === 'venta_efectivo')?.amount).toBe(4200);
  });

  it('venta fiada aumenta la deuda del cliente', async () => {
    seedIfEmpty([prod({ stock: 10 })], []);
    const c = await localStore.saveCustomer({ name: 'Carlos', balance: 0 });
    await localStore.processSale(
      sale([{ productId: 'p1', barcode: '111', name: 'Coca 500', quantity: 1, unitPrice: 1400, costPrice: 800, subtotal: 1400 }], {
        paymentMethod: 'fiado',
        customerId: c.id,
      }),
    );
    expect((await localStore.fetchCustomers())[0].balance).toBe(1400);
  });

  it('anular una venta repone el stock y revierte el fiado', async () => {
    seedIfEmpty([prod({ stock: 10 })], []);
    const c = await localStore.saveCustomer({ name: 'Carlos', balance: 0 });
    await localStore.processSale(
      sale([{ productId: 'p1', barcode: '111', name: 'Coca 500', quantity: 4, unitPrice: 1400, costPrice: 800, subtotal: 5600 }], {
        paymentMethod: 'fiado',
        customerId: c.id,
      }),
    );
    await localStore.voidSale('sale-1', 'error de carga');

    expect((await localStore.fetchProducts())[0].stock).toBe(10);
    expect((await localStore.fetchCustomers())[0].balance).toBe(0);
    expect((await localStore.fetchSales())[0].status).toBe('cancelled');
  });
});

describe('localStore — compras y proveedores', () => {
  it('compra suma stock, actualiza costo y (en cuenta) la deuda al proveedor', async () => {
    seedIfEmpty([prod({ stock: 2, costPrice: 800 })], []);
    const s = await localStore.saveSupplier({ name: 'Distri', balance: 0 });
    await localStore.registerPurchase({
      supplierId: s.id,
      paid: false,
      total: 5000,
      items: [{ productId: 'p1', name: 'Coca 500', quantity: 6, costPrice: 900, subtotal: 5400 }],
    });

    const p = (await localStore.fetchProducts())[0];
    expect(p.stock).toBe(8);
    expect(p.costPrice).toBe(900);
    expect((await localStore.fetchSuppliers())[0].balance).toBe(5000);
  });

  it('pago a proveedor baja el saldo y descuenta de caja', async () => {
    const s = await localStore.saveSupplier({ name: 'Distri', balance: 5000 });
    const session = await localStore.openCashSession(10000, '');
    await localStore.registerSupplierPayment(s.id, 3000, 'efectivo', '', session.id);

    expect((await localStore.fetchSuppliers())[0].balance).toBe(2000);
    const cash = await localStore.fetchCashMovements(session.id);
    expect(cash.find((m) => m.type === 'pago_proveedor')?.amount).toBe(-3000);
  });
});

describe('localStore — gastos y caja', () => {
  it('gasto en efectivo se descuenta del arqueo esperado', async () => {
    const session = await localStore.openCashSession(1000, '');
    await localStore.registerExpense('Servicios', 'Luz', 700, 'efectivo', session.id);
    const { expected } = await localStore.closeCashSession(session.id, 300, '');
    expect(expected).toBe(300); // 1000 apertura - 700 gasto
  });

  it('closeCashSession calcula la diferencia', async () => {
    const session = await localStore.openCashSession(1000, '');
    await localStore.addCashMovement(session.id, 'ingreso', 500, 'vuelto');
    const { expected, difference } = await localStore.closeCashSession(session.id, 1400, '');
    expect(expected).toBe(1500);
    expect(difference).toBe(-100);
  });
});
