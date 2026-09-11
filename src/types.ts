// ============================================================================
// Tipos centrales de KioscoControl
// ============================================================================

export type Category =
  | 'Golosinas'
  | 'Bebidas'
  | 'Bebidas Alcohólicas'
  | 'Snacks'
  | 'Galletitas'
  | 'Cigarrillos'
  | 'Almacén'
  | 'Kiosco'
  | 'Limpieza'
  | 'Varios';

export const CATEGORIES: Category[] = [
  'Golosinas',
  'Bebidas',
  'Bebidas Alcohólicas',
  'Snacks',
  'Galletitas',
  'Cigarrillos',
  'Almacén',
  'Kiosco',
  'Limpieza',
  'Varios',
];

/** 'unit' = precio por unidad · 'kg' = precio por kilo (se vende por peso). */
export type PriceUnit = 'unit' | 'kg';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: Category;
  brand?: string;
  supplier?: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  unit?: string;
  priceUnit?: PriceUnit;
  imageUrl?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleItem {
  productId: string;
  barcode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  subtotal: number;
}

export type PaymentMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'fiado';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transfer / QR',
  debito: 'Débito',
  credito: 'Crédito',
  fiado: 'Fiado',
};

export interface Sale {
  id: string;
  timestamp: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost: number;
  profit: number;
  paymentMethod: PaymentMethod;
  amountPaid?: number | null;
  changeGiven?: number | null;
  customerId?: string | null;
  customerName?: string | null;
  notes?: string | null;
  cashSessionId?: string | null;
  status?: 'completed' | 'cancelled';
}

// ----------------------------------------------------------------------------
// Movimientos de stock (auditoría)
// ----------------------------------------------------------------------------

export type StockMovementType = 'venta' | 'compra' | 'ajuste' | 'devolucion' | 'merma' | 'alta';

export interface StockMovement {
  id: string;
  productId: string;
  productName?: string;
  type: StockMovementType;
  quantity: number; // firmado: negativo = salida, positivo = entrada
  stockAfter: number;
  reason?: string | null;
  refId?: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Clientes / Cuenta corriente (fiado)
// ----------------------------------------------------------------------------

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  balance: number; // positivo = el cliente debe
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  notes?: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Proveedores / cuenta corriente
// ----------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  balance: number; // positivo = le debo al proveedor
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amount: number;
  method: PaymentMethod;
  notes?: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Gastos del kiosco
// ----------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'Alquiler',
  'Servicios',
  'Sueldos',
  'Mercadería',
  'Impuestos',
  'Fletes',
  'Mantenimiento',
  'General',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  date: string;
  category: string;
  description?: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  cashSessionId?: string | null;
  createdAt?: string;
}

// ----------------------------------------------------------------------------
// Caja / Arqueo
// ----------------------------------------------------------------------------

export type CashMovementType =
  | 'apertura'
  | 'ingreso'
  | 'retiro'
  | 'venta_efectivo'
  | 'pago_fiado'
  | 'gasto'
  | 'pago_proveedor';

export interface CashSession {
  id: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: number;
  closingCountedAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  notes?: string | null;
  status: 'open' | 'closed';
}

export interface CashMovement {
  id: string;
  cashSessionId: string;
  type: CashMovementType;
  amount: number; // firmado
  reason?: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Compras a proveedor
// ----------------------------------------------------------------------------

export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  costPrice: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  timestamp: string;
  supplier?: string | null;
  supplierId?: string | null;
  items: PurchaseItem[];
  total: number;
  paid?: boolean;
  notes?: string | null;
}

// ----------------------------------------------------------------------------
// Reportes
// ----------------------------------------------------------------------------

export type DateRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface ReportSummary {
  rangeLabel: string;
  totalSales: number;
  totalProfit: number; // ganancia bruta (venta - costo de mercadería)
  totalExpenses: number;
  netProfit: number; // ganancia bruta - gastos del período
  salesCount: number;
  averageTicket: number;
  itemsSold: number;
  totalInventoryValuationCost: number;
  totalInventoryValuationRetail: number;
  potentialProfit: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalReceivables: number; // total fiado pendiente
  totalPayables: number; // total que se debe a proveedores
  expensesByCategory: { category: string; total: number }[];
  topSellingProducts: {
    name: string;
    quantity: number;
    revenue: number;
    profit: number;
  }[];
  salesByPaymentMethod: {
    method: PaymentMethod;
    label: string;
    total: number;
    count: number;
  }[];
  dailySales: {
    day: string;
    revenue: number;
    profit: number;
    count: number;
  }[];
  hourlySales: {
    hour: string;
    revenue: number;
    count: number;
  }[];
}
