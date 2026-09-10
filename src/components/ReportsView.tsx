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
  Package,
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
import { ReportSummary, Sale, Product, Customer, PaymentMethod, DateRangePreset } from '../types';
import { PAYMENT_LABELS } from '../types';
import { money, number as fmtNum, dateTime, longDate } from '../utils/format';
import { resolveRange } from '../utils/dateRange';
import * as db from '../utils/db';

interface Props {
  products: Product[];
  customers: Customer[];
  onDataChanged?: () => void;
}

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: '7 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'custom', label: 'Personalizado' },
];

export const ReportsView: React.FC<Props> = ({ products, customers, onDataChanged }) => {
  const [preset, setPreset] = useState<DateRangePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const sales = useMemo(() => allSales.filter((s) => s.status !== 'cancelled'), [allSales]);

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await db.fetchSales(range.from.toISOString(), range.to.toISOString());
      setAllSales(data);
    } catch (err: any) {
      setError(err.message || 'Error cargando reportes');
    } finally {
      setIsLoading(false);
    }
  }, [range.from, range.to]);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    return {
      rangeLabel: range.label,
      totalSales: Math.round(totalSales),
      totalProfit: Math.round(totalProfit),
      salesCount,
      averageTicket: salesCount > 0 ? Math.round(totalSales / salesCount) : 0,
      itemsSold,
      totalInventoryValuationCost: Math.round(valCost),
      totalInventoryValuationRetail: Math.round(valRetail),
      potentialProfit: Math.round(valRetail - valCost),
      lowStockCount: products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length,
      outOfStockCount: products.filter((p) => p.stock === 0).length,
      totalReceivables: customers.reduce((a, c) => a + Math.max(0, c.balance), 0),
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
  }, [sales, products, customers, range.label]);

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
  const dailyChart: any[] =
    preset === 'today' || preset === 'yesterday' ? summary.hourlySales : summary.dailySales;
  const chartXKey = preset === 'today' || preset === 'yesterday' ? 'hour' : 'day';

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="bg-white border-2 border-black p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-serif italic font-bold text-black">Reportes y métricas</h3>
              <p className="text-[11px] text-neutral-600 capitalize">
                {range.label} · {longDate()}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchData}
              className="p-2 bg-[#F2F2EF] hover:bg-black hover:text-white border border-black text-black transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-2 bg-[#F2F2EF] hover:bg-white text-black border border-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              onClick={exportToCSV}
              className="px-3.5 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors ${
                preset === p.id ? 'bg-black text-white border-black' : 'bg-[#F2F2EF] text-black border-black/40 hover:border-black'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="flex items-center gap-1.5 ml-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-black px-2 py-1 text-xs font-mono"
              />
              <span className="text-xs">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-black px-2 py-1 text-xs font-mono"
              />
            </span>
          )}
        </div>
      </div>

      {error ? (
        <div className="p-8 text-center bg-white border-2 border-black">
          <p className="text-xs font-serif italic text-red-600 mb-3">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider border-2 border-black"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI label={`Ventas · ${range.label}`} value={money(summary.totalSales)} sub={`${summary.salesCount} operaciones`} icon={DollarSign} />
            <KPI label="Ganancia neta" value={money(summary.totalProfit)} sub={`Margen ${profitMargin}%`} icon={TrendingUp} />
            <KPI label="Ticket promedio" value={money(summary.averageTicket)} sub={`${fmtNum(summary.itemsSold)} unidades`} icon={ShoppingBag} />
            <KPI label="Capital en stock" value={money(summary.totalInventoryValuationRetail)} sub={`Costo: ${money(summary.totalInventoryValuationCost)}`} icon={Wallet} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI label="A cobrar (fiado)" value={money(summary.totalReceivables)} sub="Cuentas corrientes" icon={Wallet} small />
            <KPI label="Ganancia potencial stock" value={money(summary.potentialProfit)} sub="Si se vende todo" icon={TrendingUp} small />
            <KPI label="Stock bajo" value={String(summary.lowStockCount)} sub="Productos en alerta" icon={Package} small />
            <KPI label="Sin stock" value={String(summary.outOfStockCount)} sub="Productos agotados" icon={Package} small />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 bg-white border-2 border-black p-4">
              <div className="flex items-center gap-1.5 mb-4 border-b border-black/10 pb-2">
                <Clock className="w-3.5 h-3.5 text-black" />
                <h4 className="text-xs font-bold text-black uppercase tracking-widest">
                  {preset === 'today' || preset === 'yesterday' ? 'Ventas por hora' : 'Ventas por día'}
                </h4>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChart}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1A1A1A" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#1A1A1A" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="#EAEAE6" />
                    <XAxis dataKey={chartXKey} stroke="#1A1A1A" fontSize={10} tickLine={false} />
                    <YAxis stroke="#1A1A1A" fontSize={10} tickLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: 0, fontSize: 11, fontWeight: 'bold' }}
                      formatter={(v: any) => [money(Number(v)), 'Ventas']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#000" strokeWidth={2} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-4 bg-white border-2 border-black p-4 flex flex-col">
              <h4 className="text-xs font-bold text-black uppercase tracking-widest flex items-center gap-1.5 mb-3">
                <Wallet className="w-3.5 h-3.5" /> Por medio de pago
              </h4>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.salesByPaymentMethod} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="label" type="category" stroke="#1A1A1A" fontSize={10} tickLine={false} width={72} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: 0, fontSize: 11, fontWeight: 'bold' }}
                      formatter={(v: any) => [money(Number(v)), 'Total']}
                    />
                    <Bar dataKey="total" fill="#1A1A1A" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pt-2 border-t border-black/10 space-y-1 text-[11px]">
                {summary.salesByPaymentMethod
                  .filter((m) => m.total > 0)
                  .map((m) => (
                    <div key={m.method} className="flex justify-between">
                      <span className="font-medium">{m.label}</span>
                      <span className="font-mono font-bold">
                        {money(m.total)} ({m.count})
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-black p-4">
            <div className="flex items-center space-x-2 mb-3 border-b border-black/10 pb-2">
              <Award className="w-4 h-4 text-black" />
              <h4 className="text-xs font-bold text-black uppercase tracking-widest">Más vendidos · {range.label}</h4>
            </div>
            {summary.topSellingProducts.length === 0 ? (
              <p className="text-xs font-serif italic text-neutral-500 py-4 text-center">
                Sin ventas en este período.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {summary.topSellingProducts.map((p, idx) => (
                  <div key={p.name} className="p-3 bg-[#F2F2EF] border border-black flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="w-6 h-6 border border-black bg-black text-white flex items-center justify-center text-xs font-bold font-mono">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-black truncate">{p.name}</h5>
                        <span className="text-[11px] font-mono text-neutral-600">
                          {p.quantity} un · ganancia {money(p.profit)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-serif italic font-bold text-black pl-2">{money(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border-2 border-black overflow-hidden">
            <div className="px-4 py-3 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-black" />
                <h4 className="text-xs font-bold text-black uppercase tracking-widest">Ventas del período</h4>
              </div>
              <span className="text-xs font-mono font-bold text-neutral-600">[{allSales.length}]</span>
            </div>
            <div className="divide-y divide-black/10 max-h-96 overflow-y-auto">
              {allSales.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 font-serif italic text-xs">
                  No hay ventas en este período.
                </div>
              ) : (
                allSales.slice(0, 100).map((sale) => {
                  const cancelled = sale.status === 'cancelled';
                  return (
                    <div
                      key={sale.id}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                        cancelled ? 'bg-red-50/40' : 'hover:bg-[#F9F9F7]'
                      }`}
                    >
                      <div className={cancelled ? 'opacity-60' : ''}>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-mono text-neutral-600 text-[11px]">{dateTime(sale.timestamp)}</span>
                          <span className="px-1.5 py-0.2 border border-black bg-[#F2F2EF] font-mono text-[9px] font-bold uppercase tracking-wider">
                            {PAYMENT_LABELS[sale.paymentMethod]}
                          </span>
                          {sale.customerName && <span className="text-black font-bold">{sale.customerName}</span>}
                          {sale.discount > 0 && <span className="text-red-600 font-mono">-{money(sale.discount)}</span>}
                          {cancelled && (
                            <span className="px-1.5 py-0.2 bg-red-600 text-white font-mono text-[9px] font-bold uppercase tracking-wider">
                              Anulada
                            </span>
                          )}
                        </div>
                        <p className={`text-neutral-700 mt-1 font-serif italic ${cancelled ? 'line-through' : ''}`}>
                          {sale.items.map((i) => `${i.quantity}x ${i.name}`).join(' • ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <div className="text-left sm:text-right">
                          <span className={`text-sm font-bold text-black font-serif italic ${cancelled ? 'line-through' : ''}`}>
                            {money(sale.total)}
                          </span>
                          {!cancelled && (
                            <span className="block text-[11px] text-emerald-800 font-mono font-semibold">
                              +{money(sale.profit)} ganancia
                            </span>
                          )}
                        </div>
                        {!cancelled && (
                          <button
                            onClick={() => handleVoid(sale)}
                            disabled={voidingId === sale.id}
                            className="px-2 py-1 border border-black/30 hover:border-red-600 hover:text-red-600 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
                            title="Anular venta"
                          >
                            {voidingId === sale.id ? '...' : 'Anular'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const KPI: React.FC<{
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  small?: boolean;
}> = ({ label, value, sub, icon: Icon, small }) => (
  <div className="bg-white border-2 border-black p-4">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">{label}</span>
      <Icon className="w-4 h-4 text-black" />
    </div>
    <p className={`${small ? 'text-xl' : 'text-2xl sm:text-3xl'} font-black text-black font-serif italic tracking-tight`}>
      {value}
    </p>
    <span className="text-[11px] text-neutral-600 font-mono font-medium block mt-1">{sub}</span>
  </div>
);
