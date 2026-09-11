import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Download,
  RefreshCw,
  Calendar,
  Wallet,
  Clock,
  Printer,
  Plus,
  Trash2,
  Receipt,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import {
  ReportSummary,
  Sale,
  Product,
  Customer,
  Supplier,
  Expense,
  CashSession,
  PaymentMethod,
  DateRangePreset,
} from '../types';
import { PAYMENT_LABELS, EXPENSE_CATEGORIES } from '../types';
import { money, number as fmtNum, dateTime, longDate } from '../utils/format';
import { resolveRange } from '../utils/dateRange';
import {
  Card,
  Button,
  IconButton,
  Input,
  Select,
  Label,
  Badge,
  Stat,
  Segmented,
  SectionTitle,
  Empty,
  Modal,
  cx,
} from './ui';
import * as db from '../utils/db';

type Toast = (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;

interface Props {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  cashSession: CashSession | null;
  onDataChanged?: () => void;
  onToast: Toast;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'week', label: '7 días' },
  { value: 'month', label: 'Mes' },
  { value: 'custom', label: 'Rango' },
];

const AXIS = '#94908a';
const GRID = '#e6e4e0';
const TOOLTIP = {
  backgroundColor: '#fff',
  border: '1px solid #e6e4e0',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 8px 24px -6px rgba(28,26,23,0.16)',
  padding: '6px 10px',
} as const;

export const ReportsView: React.FC<Props> = ({
  products,
  customers,
  suppliers,
  cashSession,
  onDataChanged,
  onToast,
}) => {
  const [preset, setPreset] = useState<DateRangePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [expenseModal, setExpenseModal] = useState(false);

  const sales = useMemo(() => allSales.filter((s) => s.status !== 'cancelled'), [allSales]);
  const range = useMemo(() => resolveRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [s, e] = await Promise.all([
        db.fetchSales(range.from.toISOString(), range.to.toISOString()),
        db.fetchExpenses(range.from.toISOString(), range.to.toISOString()),
      ]);
      setAllSales(s);
      setExpenses(e);
    } catch (err: any) {
      setError(err.message || 'Error cargando reportes');
    } finally {
      setIsLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVoid = async (sale: Sale) => {
    const reason = window.prompt(`Anular la venta de ${money(sale.total)}. Motivo:`, 'Error de carga');
    if (reason === null) return;
    try {
      setVoidingId(sale.id);
      await db.voidSale(sale.id, reason);
      await fetchData();
      onDataChanged?.();
    } catch (err: any) {
      alert(err.message || 'No se pudo anular');
    } finally {
      setVoidingId(null);
    }
  };

  const summary: ReportSummary = useMemo(() => {
    const methodData: Record<PaymentMethod, { total: number; count: number }> = {
      efectivo: { total: 0, count: 0 },
      transferencia: { total: 0, count: 0 },
      debito: { total: 0, count: 0 },
      credito: { total: 0, count: 0 },
      fiado: { total: 0, count: 0 },
    };
    const productSales: Record<string, { name: string; quantity: number; revenue: number; profit: number }> = {};
    const dayMap: Record<string, { revenue: number; profit: number; count: number }> = {};
    const hourMap: Record<string, { revenue: number; count: number }> = {};

    let totalSales = 0;
    let totalProfit = 0;
    let itemsSold = 0;

    sales.forEach((sale) => {
      totalSales += sale.total;
      totalProfit += sale.profit;
      if (methodData[sale.paymentMethod]) {
        methodData[sale.paymentMethod].total += sale.total;
        methodData[sale.paymentMethod].count += 1;
      }
      const day = new Date(sale.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      dayMap[day] = dayMap[day] || { revenue: 0, profit: 0, count: 0 };
      dayMap[day].revenue += sale.total;
      dayMap[day].profit += sale.profit;
      dayMap[day].count += 1;

      const hour = new Date(sale.timestamp).getHours().toString().padStart(2, '0') + 'h';
      hourMap[hour] = hourMap[hour] || { revenue: 0, count: 0 };
      hourMap[hour].revenue += sale.total;
      hourMap[hour].count += 1;

      sale.items.forEach((item) => {
        itemsSold += item.quantity;
        const p = (productSales[item.productId] = productSales[item.productId] || {
          name: item.name,
          quantity: 0,
          revenue: 0,
          profit: 0,
        });
        p.quantity += item.quantity;
        p.revenue += item.subtotal;
        p.profit += (item.unitPrice - item.costPrice) * item.quantity;
      });
    });

    const salesCount = sales.length;
    const valCost = products.reduce((a, p) => a + p.costPrice * p.stock, 0);
    const valRetail = products.reduce((a, p) => a + p.sellPrice * p.stock, 0);

    const expByCat: Record<string, number> = {};
    let totalExpenses = 0;
    expenses.forEach((e) => {
      totalExpenses += e.amount;
      expByCat[e.category] = (expByCat[e.category] || 0) + e.amount;
    });

    return {
      rangeLabel: range.label,
      totalSales: Math.round(totalSales),
      totalProfit: Math.round(totalProfit),
      totalExpenses: Math.round(totalExpenses),
      netProfit: Math.round(totalProfit - totalExpenses),
      salesCount,
      averageTicket: salesCount > 0 ? Math.round(totalSales / salesCount) : 0,
      itemsSold,
      totalInventoryValuationCost: Math.round(valCost),
      totalInventoryValuationRetail: Math.round(valRetail),
      potentialProfit: Math.round(valRetail - valCost),
      lowStockCount: products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length,
      outOfStockCount: products.filter((p) => p.stock === 0).length,
      totalReceivables: customers.reduce((a, c) => a + Math.max(0, c.balance), 0),
      totalPayables: suppliers.reduce((a, s) => a + Math.max(0, s.balance), 0),
      expensesByCategory: Object.entries(expByCat)
        .map(([category, total]) => ({ category, total: Math.round(total) }))
        .sort((a, b) => b.total - a.total),
      topSellingProducts: Object.values(productSales).sort((a, b) => b.quantity - a.quantity).slice(0, 6),
      salesByPaymentMethod: (Object.keys(methodData) as PaymentMethod[]).map((m) => ({
        method: m,
        label: PAYMENT_LABELS[m],
        ...methodData[m],
      })),
      dailySales: Object.entries(dayMap).map(([day, d]) => ({ day, ...d })),
      hourlySales: Object.entries(hourMap)
        .map(([hour, d]) => ({ hour, ...d }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
    };
  }, [sales, expenses, products, customers, suppliers, range.label]);

  const deleteExpense = async (id: string) => {
    try {
      await db.deleteExpense(id);
      await fetchData();
      onDataChanged?.();
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Fecha', 'Total', 'Ganancia', 'Pago', 'Artículos', 'Cliente'];
    const rows = sales.map((s) => [
      s.id,
      dateTime(s.timestamp),
      s.total,
      s.profit,
      s.paymentMethod,
      `"${s.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}"`,
      s.customerName || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `reporte_kiosco_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const profitMargin =
    summary.totalSales > 0 ? Math.round((summary.totalProfit / summary.totalSales) * 100) : 0;
  const isDaily = preset === 'today' || preset === 'yesterday';
  const chartData: any[] = isDaily ? summary.hourlySales : summary.dailySales;
  const chartKey = isDaily ? 'hour' : 'day';

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <Card pad className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <SectionTitle icon={TrendingUp}>Reportes</SectionTitle>
            <p className="mt-0.5 text-xs text-muted capitalize">
              {range.label} · {longDate()}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton variant="ghost" onClick={fetchData} title="Actualizar">
              <RefreshCw className={cx('h-4 w-4', isLoading && 'animate-spin')} />
            </IconButton>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
            <Button variant="primary" onClick={exportToCSV}>
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              CSV
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={preset} onChange={setPreset} options={PRESETS} />
          {preset === 'custom' && (
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-line-strong px-2 h-8 text-[13px] nums"
              />
              →
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-line-strong px-2 h-8 text-[13px] nums"
              />
            </span>
          )}
        </div>
      </Card>

      {error ? (
        <Card pad className="text-center">
          <p className="mb-3 text-[13px] text-danger">{error}</p>
          <Button variant="primary" onClick={fetchData}>
            Reintentar
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={`Ventas · ${range.label}`} value={money(summary.totalSales)} hint={`${summary.salesCount} operaciones`} icon={DollarSign} />
            <Stat label="Ganancia bruta" value={money(summary.totalProfit)} hint={`margen ${profitMargin}%`} icon={TrendingUp} />
            <Stat label="Gastos" value={money(summary.totalExpenses)} hint="del período" tone={summary.totalExpenses > 0 ? 'negative' : 'default'} icon={Receipt} />
            <Stat
              label="Ganancia neta"
              value={money(summary.netProfit)}
              hint="bruta − gastos"
              tone={summary.netProfit >= 0 ? 'positive' : 'negative'}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Ticket promedio" value={money(summary.averageTicket)} hint={`${fmtNum(summary.itemsSold)} unidades`} icon={ShoppingBag} />
            <Stat label="Capital en stock" value={money(summary.totalInventoryValuationRetail)} hint={`costo ${money(summary.totalInventoryValuationCost)}`} icon={Wallet} />
            <Stat label="A cobrar (fiado)" value={money(summary.totalReceivables)} hint="cuentas de clientes" tone={summary.totalReceivables > 0 ? 'negative' : 'default'} />
            <Stat label="A pagar (proveedores)" value={money(summary.totalPayables)} hint="cuentas con proveedores" tone={summary.totalPayables > 0 ? 'negative' : 'default'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card pad className="lg:col-span-8">
              <SectionTitle icon={Clock} className="mb-3">
                {isDaily ? 'Ventas por hora' : 'Ventas por día'}
              </SectionTitle>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f7a52" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#0f7a52" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey={chartKey} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => [money(Number(v)), 'Ventas']} />
                    <Area type="monotone" dataKey="revenue" stroke="#0f7a52" strokeWidth={2} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card pad className="lg:col-span-4 flex flex-col">
              <SectionTitle icon={Wallet} className="mb-3">
                Medio de pago
              </SectionTitle>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.salesByPaymentMethod} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="label" type="category" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={70} />
                    <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#f2f1ee' }} formatter={(v: any) => [money(Number(v)), 'Total']} />
                    <Bar dataKey="total" fill="#1c1a17" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1 border-t border-line pt-2 text-[13px]">
                {summary.salesByPaymentMethod
                  .filter((m) => m.total > 0)
                  .map((m) => (
                    <div key={m.method} className="flex justify-between">
                      <span className="text-ink-soft">{m.label}</span>
                      <span className="font-medium nums">
                        {money(m.total)} · {m.count}
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <SectionTitle icon={Receipt}>Gastos · {range.label}</SectionTitle>
              <Button size="sm" variant="secondary" onClick={() => setExpenseModal(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Registrar gasto
              </Button>
            </div>
            {expenses.length === 0 ? (
              <Empty title="Sin gastos" hint="Registrá alquiler, servicios, sueldos… para ver la ganancia neta real." />
            ) : (
              <>
                {summary.expensesByCategory.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-line">
                    {summary.expensesByCategory.map((c) => (
                      <Badge key={c.category}>
                        {c.category} {money(c.total)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="divide-y divide-line max-h-72 overflow-y-auto">
                  {expenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                      <div className="min-w-0">
                        <span className="font-medium">{e.description || e.category}</span>
                        <span className="block text-xs text-muted nums">
                          {dateTime(e.date)} · {e.category} · {PAYMENT_LABELS[e.paymentMethod as PaymentMethod] || e.paymentMethod}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-semibold nums text-danger">−{money(e.amount)}</span>
                        <IconButton variant="ghost" className="h-7 w-7 hover:text-danger" onClick={() => deleteExpense(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card pad>
            <SectionTitle icon={Award} className="mb-3">
              Más vendidos · {range.label}
            </SectionTitle>
            {summary.topSellingProducts.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted">Sin ventas en este período.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {summary.topSellingProducts.map((p, idx) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-white text-xs font-semibold nums">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h5 className="truncate text-[13px] font-medium">{p.name}</h5>
                        <span className="text-xs text-muted nums">
                          {p.quantity} u · +{money(p.profit)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold nums">{money(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <SectionTitle icon={Calendar}>Ventas del período</SectionTitle>
              <span className="text-xs text-muted nums">{allSales.length}</span>
            </div>
            {allSales.length === 0 ? (
              <Empty title="Sin ventas" hint="No hubo ventas en este período." />
            ) : (
              <div className="divide-y divide-line max-h-[28rem] overflow-y-auto">
                {allSales.slice(0, 100).map((sale) => {
                  const cancelled = sale.status === 'cancelled';
                  return (
                    <div
                      key={sale.id}
                      className={cx(
                        'flex flex-col gap-2 px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between',
                        cancelled ? 'bg-danger-soft/40' : 'hover:bg-surface-2/50',
                      )}
                    >
                      <div className={cancelled ? 'opacity-60' : ''}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted nums">{dateTime(sale.timestamp)}</span>
                          <Badge>{PAYMENT_LABELS[sale.paymentMethod]}</Badge>
                          {sale.customerName && <span className="font-medium">{sale.customerName}</span>}
                          {sale.discount > 0 && <span className="text-danger nums">−{money(sale.discount)}</span>}
                          {cancelled && <Badge tone="red">Anulada</Badge>}
                        </div>
                        <p className={cx('mt-1 text-muted', cancelled && 'line-through')}>
                          {sale.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <div className="text-left sm:text-right">
                          <span className={cx('font-semibold nums', cancelled && 'line-through')}>
                            {money(sale.total)}
                          </span>
                          {!cancelled && (
                            <span className="block text-xs text-brand nums">+{money(sale.profit)}</span>
                          )}
                        </div>
                        {!cancelled && (
                          <button
                            onClick={() => handleVoid(sale)}
                            disabled={voidingId === sale.id}
                            className="rounded-lg px-2 h-7 text-xs font-medium text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
                          >
                            {voidingId === sale.id ? '…' : 'Anular'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {expenseModal && (
        <ExpenseModal
          cashSession={cashSession}
          onClose={() => setExpenseModal(false)}
          onDone={async () => {
            setExpenseModal(false);
            await fetchData();
            onDataChanged?.();
            onToast({ message: 'Gasto registrado', type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}
    </div>
  );
};

const ExpenseModal: React.FC<{
  cashSession: CashSession | null;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}> = ({ cashSession, onClose, onDone, onError }) => {
  const [category, setCategory] = useState<string>('General');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [busy, setBusy] = useState(false);
  const value = parseFloat(amount) || 0;

  const save = async () => {
    if (value <= 0) return;
    try {
      setBusy(true);
      await db.registerExpense(
        category,
        description,
        value,
        method,
        method === 'efectivo' ? cashSession?.id ?? null : null,
      );
      await onDone();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="sm"
      title="Registrar gasto"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || value <= 0}>
            {busy ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Categoría</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Descripción</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Luz — factura enero"
          />
        </div>
        <div>
          <Label>Monto</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-7 nums" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(['efectivo', 'transferencia', 'debito'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={cx(
                'rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors',
                method === m ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
        {method === 'efectivo' && !cashSession && (
          <p className="text-xs text-warn">Caja cerrada: el gasto no se descuenta del arqueo.</p>
        )}
      </div>
    </Modal>
  );
};
