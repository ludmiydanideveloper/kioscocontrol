import React, { useState, useEffect, useMemo } from 'react';
import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  UserCheck,
  Check,
  Share2,
  Printer,
  AlertTriangle,
  Search,
  ScanLine,
} from 'lucide-react';
import { Product, SaleItem, PaymentMethod, Sale, Customer, CashSession } from '../types';
import { PAYMENT_LABELS } from '../types';
import { soundFX } from '../utils/audio';
import { money } from '../utils/format';
import { printTicket } from '../utils/printTicket';
import { cx, Card, Button, Input, Select, Badge, Empty, Modal, Label } from './ui';
import * as db from '../utils/db';
import confetti from 'canvas-confetti';

interface Props {
  products: Product[];
  customers: Customer[];
  cashSession: CashSession | null;
  pendingScan: { code: string; n: number } | null;
  onScanConsumed: () => void;
  onOpenScanner: () => void;
  onSaleCompleted: () => void;
  onCustomersChanged: () => Promise<void>;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

const METHODS: { id: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'transferencia', label: 'Transf / QR', icon: QrCode },
  { id: 'debito', label: 'Débito', icon: CreditCard },
  { id: 'credito', label: 'Crédito', icon: CreditCard },
  { id: 'fiado', label: 'Fiado', icon: UserCheck },
];

export const QuickSalesPOS: React.FC<Props> = ({
  products,
  customers,
  cashSession,
  pendingScan,
  onScanConsumed,
  onOpenScanner,
  onSaleCompleted,
  onCustomersChanged,
  onToast,
}) => {
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<Product[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashGiven, setCashGiven] = useState('');
  const [discount, setDiscount] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const isWeightItem = (productId: string) => productById.get(productId)?.priceUnit === 'kg';
  const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(3));

  const quickProducts = useMemo(
    () => [...products].sort((a, b) => b.stock - a.stock).slice(0, 8),
    [products],
  );

  const cartSubtotal = cart.reduce((acc, i) => acc + i.subtotal, 0);
  const discountValue = Math.min(cartSubtotal, Math.max(0, parseFloat(discount) || 0));
  const cartTotal = cartSubtotal - discountValue;
  const cartItemCount = cart.reduce((acc, i) => acc + (Number.isInteger(i.quantity) ? i.quantity : 1), 0);
  const cartCost = cart.reduce((acc, i) => acc + i.costPrice * i.quantity, 0);

  const addToCart = (product: Product, quantity?: number) => {
    // Productos por peso: pedir los gramos con un modal.
    if (product.priceUnit === 'kg' && quantity === undefined) {
      setWeightProduct(product);
      setSearchQuery('');
      setMatches([]);
      return;
    }
    const qtyToAdd = quantity ?? 1;
    const inCart = cart.find((i) => i.productId === product.id)?.quantity ?? 0;
    if (inCart + qtyToAdd > product.stock) {
      soundFX.playErrorBuzz();
      onToast({ message: `Stock insuficiente de ${product.name} (quedan ${product.stock})`, type: 'warning' });
      return;
    }
    soundFX.playBarcodeBeep();
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx > -1) {
        const updated = [...prev];
        const qty = updated[idx].quantity + qtyToAdd;
        updated[idx] = { ...updated[idx], quantity: qty, subtotal: qty * updated[idx].unitPrice };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          barcode: product.barcode,
          name: product.name,
          quantity: qtyToAdd,
          unitPrice: product.sellPrice,
          costPrice: product.costPrice,
          subtotal: qtyToAdd * product.sellPrice,
        },
      ];
    });
    setSearchQuery('');
    setMatches([]);
  };

  /** Fija el peso (kg) de un producto en el carrito, reemplazando la cantidad. */
  const setWeightInCart = (product: Product, kg: number) => {
    if (kg <= 0) return;
    if (kg > product.stock) {
      soundFX.playErrorBuzz();
      onToast({ message: `Sólo hay ${fmtQty(product.stock)} kg de ${product.name}`, type: 'warning' });
      return;
    }
    soundFX.playBarcodeBeep();
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      const line: SaleItem = {
        productId: product.id,
        barcode: product.barcode,
        name: product.name,
        quantity: kg,
        unitPrice: product.sellPrice,
        costPrice: product.costPrice,
        subtotal: kg * product.sellPrice,
      };
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = line;
        return updated;
      }
      return [...prev, line];
    });
    setWeightProduct(null);
  };

  /** Alta rápida de cliente desde el POS (para vender fiado sin salir de acá). */
  const handleQuickAddCustomer = async () => {
    const name = window.prompt('Nombre del cliente');
    if (name === null || !name.trim()) return;
    const phone = window.prompt('Teléfono (opcional)', '') || '';
    try {
      const created = await db.saveCustomer({ name: name.trim(), phone: phone.trim() || null, balance: 0 });
      await onCustomersChanged();
      setCustomerId(created.id);
      onToast({ message: `Cliente "${created.name}" creado`, type: 'success' });
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo crear el cliente', type: 'error' });
    }
  };

  /** Agrega un ítem de monto libre (cigarrillo suelto, algo sin código, etc.). */
  const addFreeAmount = () => {
    const name = window.prompt('¿Qué vendés? (nombre del ítem)', 'Varios');
    if (name === null) return;
    const raw = window.prompt(`Precio de "${name.trim() || 'Varios'}"`, '');
    if (raw === null) return;
    const amount = parseFloat(raw) || 0;
    if (amount <= 0) return;
    soundFX.playBarcodeBeep();
    setCart((prev) => [
      ...prev,
      {
        productId: `libre-${Date.now()}`,
        barcode: '',
        name: name.trim() || 'Varios',
        quantity: 1,
        unitPrice: amount,
        costPrice: 0,
        subtotal: amount,
      },
    ]);
  };

  useEffect(() => {
    if (!pendingScan) return;
    const matched = products.find((p) => p.barcode === pendingScan.code.trim());
    if (matched) {
      addToCart(matched);
      onToast({ message: `${matched.name} — ${money(matched.sellPrice)}`, type: 'success' }, 1800);
    }
    onScanConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScan?.n]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          const stock = productById.get(productId)?.stock ?? newQty;
          if (delta > 0 && newQty > stock) {
            soundFX.playErrorBuzz();
            onToast({ message: `Sólo hay ${stock} en stock`, type: 'warning' });
            return item;
          }
          return { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
        })
        .filter(Boolean) as SaleItem[],
    );
  };

  const removeFromCart = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.productId !== productId));

  const clearCart = () => {
    setCart([]);
    setIsCheckingOut(false);
    setCashGiven('');
    setDiscount('');
    setCustomerId('');
    setSaleNotes('');
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    const clean = q.toLowerCase().trim();
    if (!clean) return setMatches([]);
    setMatches(
      products
        .filter((p) => p.name.toLowerCase().includes(clean) || p.barcode.includes(clean))
        .slice(0, 6),
    );
  };

  const handleSearchEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const exact = products.find((p) => p.barcode === searchQuery.trim());
    if (exact) return addToCart(exact);
    if (matches.length === 1) addToCart(matches[0]);
  };

  const numericCash = parseFloat(cashGiven.replace(/[^0-9.]/g, '')) || 0;
  const changeAmount = numericCash >= cartTotal ? numericCash - cartTotal : 0;
  const selectedCustomer = customers.find((c) => c.id === customerId) || null;

  const handleProcessSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'fiado' && !selectedCustomer) {
      onToast({ message: 'Elegí un cliente para la venta fiada', type: 'warning' });
      return;
    }
    try {
      setIsProcessing(true);
      const sale: Omit<Sale, 'status'> = {
        id: `sale-${Date.now()}`,
        timestamp: new Date().toISOString(),
        items: cart,
        subtotal: cartSubtotal,
        discount: discountValue,
        total: cartTotal,
        totalCost: cartCost,
        profit: cartTotal - cartCost,
        paymentMethod,
        amountPaid: paymentMethod === 'efectivo' && numericCash > 0 ? numericCash : null,
        changeGiven: paymentMethod === 'efectivo' && numericCash >= cartTotal ? changeAmount : null,
        customerId: paymentMethod === 'fiado' ? selectedCustomer!.id : null,
        customerName: paymentMethod === 'fiado' ? selectedCustomer!.name : null,
        notes: saleNotes.trim() || null,
        cashSessionId: cashSession?.id ?? null,
      };
      await db.processSale(sale);
      soundFX.playSaleSuccess();
      confetti({ particleCount: 55, spread: 55, origin: { y: 0.8 }, scalar: 0.9 });
      setLastSale(sale as Sale);
      onSaleCompleted();
      clearCart();
    } catch (err: any) {
      soundFX.playErrorBuzz();
      onToast({ message: `No se pudo procesar la venta: ${err.message}`, type: 'error' }, 6000);
    } finally {
      setIsProcessing(false);
    }
  };

  const shareReceiptWhatsApp = (sale: Sale) => {
    const time = new Date(sale.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const items = sale.items.map((i) => `• ${i.quantity}x ${i.name}: ${money(i.subtotal)}`).join('\n');
    const disc = sale.discount > 0 ? `\nDescuento: -${money(sale.discount)}` : '';
    const msg = `*Comprobante*\nFecha: ${time}\n------------------------\n${items}${disc}\n------------------------\n*Total: ${money(
      sale.total,
    )}*\nPago: ${PAYMENT_LABELS[sale.paymentMethod]}\n¡Gracias por su compra!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 pb-24 lg:pb-6">
      {/* Izquierda */}
      <div className="lg:col-span-7 space-y-3.5">
        {!cashSession && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
            <span>La caja está cerrada: las ventas en efectivo no entran al arqueo. Abrila en «Caja».</span>
          </div>
        )}

        {/* Buscador + escaneo */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchEnter}
            placeholder="Buscar producto o escanear código…"
            className="w-full h-11 rounded-xl border border-line-strong bg-surface pl-9 pr-24 text-sm outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10 card-shadow"
          />
          <button
            onClick={onOpenScanner}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 h-8 px-2.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <ScanLine className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">Cámara</span>
          </button>

          {matches.length > 0 && (
            <div className="absolute z-30 inset-x-0 top-full mt-1.5 overflow-hidden rounded-xl border border-line bg-surface pop-shadow">
              {matches.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  disabled={prod.stock === 0}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{prod.name}</span>
                    <span className="block text-xs text-muted nums">
                      {prod.barcode} · stock {prod.stock}
                    </span>
                  </span>
                  <span className="font-semibold nums shrink-0">{money(prod.sellPrice)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Frecuentes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-soft">Productos frecuentes</p>
            <button
              onClick={addFreeAmount}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-soft hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Monto libre
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickProducts.map((prod) => {
              const out = prod.stock === 0;
              return (
                <button
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  disabled={out}
                  className={cx(
                    'flex flex-col justify-between rounded-xl border p-3 text-left min-h-[92px] transition-colors',
                    out
                      ? 'border-line bg-surface-2 opacity-50'
                      : 'border-line bg-surface card-shadow hover:border-line-strong active:bg-surface-2',
                  )}
                >
                  <span className="text-[13px] font-medium leading-tight line-clamp-2">{prod.name}</span>
                  <span className="mt-2 flex items-baseline justify-between">
                    <span className="font-semibold nums">
                      {money(prod.sellPrice)}
                      {prod.priceUnit === 'kg' && <span className="text-xs text-muted">/kg</span>}
                    </span>
                    <span className={cx('text-xs nums', out ? 'text-danger' : 'text-muted')}>
                      {out ? 'agotado' : fmtQty(prod.stock)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {lastSale && (
          <Card className="p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">Venta registrada</p>
                  <p className="text-xs text-muted nums truncate">
                    {money(lastSale.total)} · {PAYMENT_LABELS[lastSale.paymentMethod]}
                    {lastSale.changeGiven ? ` · vuelto ${money(lastSale.changeGiven)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => printTicket(lastSale)}>
                  <Printer className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="hidden sm:inline">Ticket</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={() => shareReceiptWhatsApp(lastSale)}>
                  <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="hidden sm:inline">WhatsApp</span>
                </Button>
                <button onClick={() => setLastSale(null)} className="p-1 text-muted hover:text-ink">
                  ✕
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Ticket */}
      <div className="lg:col-span-5">
        <Card className="flex flex-col overflow-hidden p-0 lg:sticky lg:top-[72px]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="text-sm font-semibold">Ticket</span>
            <div className="flex items-center gap-2">
              {cartItemCount > 0 && (
                <Badge>{cartItemCount} {cartItemCount === 1 ? 'ítem' : 'ítems'}</Badge>
              )}
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs font-medium text-muted hover:text-danger"
                >
                  Vaciar
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 max-h-[46vh] lg:max-h-[360px] overflow-y-auto">
            {cart.length === 0 ? (
              <Empty
                icon={Barcode}
                title="Ticket vacío"
                hint="Escaneá o tocá un producto para empezar la venta."
              />
            ) : (
              <ul className="divide-y divide-line">
                {cart.map((item) => {
                  const weight = isWeightItem(item.productId);
                  return (
                    <li key={item.productId} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{item.name}</p>
                        <p className="text-xs text-muted nums">
                          {money(item.unitPrice)} {weight ? '/ kg' : 'c/u'}
                        </p>
                      </div>
                      {weight ? (
                        <button
                          onClick={() => {
                            const p = productById.get(item.productId);
                            if (p) setWeightProduct(p);
                          }}
                          className="rounded-lg border border-line px-2.5 h-7 text-[13px] font-semibold nums text-ink-soft hover:text-ink"
                        >
                          {fmtQty(item.quantity)} kg
                        </button>
                      ) : (
                        <div className="flex items-center rounded-lg border border-line">
                          <button
                            onClick={() => updateQuantity(item.productId, -1)}
                            className="flex h-7 w-7 items-center justify-center text-ink-soft hover:text-ink"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-[13px] font-semibold nums">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, 1)}
                            className="flex h-7 w-7 items-center justify-center text-ink-soft hover:text-ink"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="w-[68px] shrink-0 text-right">
                        <span className="block text-[13px] font-semibold nums">{money(item.subtotal)}</span>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-xs text-muted hover:text-danger"
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t border-line bg-surface-2/40 p-4 space-y-3">
              {discountValue > 0 && (
                <div className="flex justify-between text-xs text-muted nums">
                  <span>Subtotal</span>
                  <span>{money(cartSubtotal)}</span>
                </div>
              )}
              <div className="flex items-end justify-between">
                <span className="text-[13px] text-ink-soft">Total</span>
                <span className="text-[28px] font-semibold tracking-tight nums leading-none">
                  {money(cartTotal)}
                </span>
              </div>

              {!isCheckingOut ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="lg"
                    variant="success"
                    onClick={() => {
                      setPaymentMethod('efectivo');
                      setIsCheckingOut(true);
                    }}
                  >
                    <Banknote className="h-4 w-4" strokeWidth={2} />
                    Efectivo
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => {
                      setPaymentMethod('transferencia');
                      setIsCheckingOut(true);
                    }}
                  >
                    <QrCode className="h-4 w-4" strokeWidth={2} />
                    Transf / QR
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium">Cobro</span>
                    <button
                      onClick={() => setIsCheckingOut(false)}
                      className="text-xs font-medium text-muted hover:text-ink"
                    >
                      Volver
                    </button>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {METHODS.map((m) => {
                      const Icon = m.icon;
                      const sel = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setPaymentMethod(m.id)}
                          className={cx(
                            'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors',
                            sel
                              ? 'border-ink bg-ink text-white'
                              : 'border-line text-ink-soft hover:border-line-strong',
                          )}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2} />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  <label className="flex items-center gap-2 text-[13px]">
                    <span className="text-ink-soft">Descuento</span>
                    <Input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0"
                      className="h-8 flex-1 nums"
                    />
                  </label>

                  {paymentMethod === 'efectivo' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                        <input
                          type="number"
                          value={cashGiven}
                          onChange={(e) => setCashGiven(e.target.value)}
                          placeholder={`Paga con… (${Math.round(cartTotal)})`}
                          className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-7 pr-3 text-sm nums outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[1000, 2000, 5000, 10000, 20000].map((b) => (
                          <button
                            key={b}
                            onClick={() => setCashGiven(String(b))}
                            className="rounded-lg border border-line px-2 py-1 text-xs font-medium nums text-ink-soft hover:border-line-strong"
                          >
                            {money(b)}
                          </button>
                        ))}
                        <button
                          onClick={() => setCashGiven(String(Math.round(cartTotal)))}
                          className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-medium text-ink"
                        >
                          Exacto
                        </button>
                      </div>
                      {numericCash > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                          <span className="text-ink-soft">Vuelto</span>
                          <span
                            className={cx(
                              'font-semibold nums',
                              numericCash >= cartTotal ? 'text-brand' : 'text-danger',
                            )}
                          >
                            {numericCash >= cartTotal ? money(changeAmount) : 'Falta dinero'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod === 'fiado' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Select
                          value={customerId}
                          onChange={(e) => setCustomerId(e.target.value)}
                          className="flex-1"
                        >
                          <option value="">
                            {customers.length === 0 ? 'Sin clientes cargados' : 'Elegí un cliente…'}
                          </option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.balance > 0 ? ` — debe ${money(c.balance)}` : ''}
                            </option>
                          ))}
                        </Select>
                        <button
                          type="button"
                          onClick={handleQuickAddCustomer}
                          className="shrink-0 rounded-lg border border-line px-2.5 h-9 text-[13px] font-medium text-ink-soft hover:text-ink"
                        >
                          + Nuevo
                        </button>
                      </div>
                      {selectedCustomer && (
                        <p className="text-xs text-muted nums">
                          Nueva deuda: {money(selectedCustomer.balance + cartTotal)}
                        </p>
                      )}
                    </div>
                  )}

                  <Input
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    placeholder="Nota (opcional)"
                    className="h-8"
                  />

                  <Button
                    size="lg"
                    variant="success"
                    className="w-full"
                    onClick={handleProcessSale}
                    disabled={isProcessing || (paymentMethod === 'fiado' && !selectedCustomer)}
                  >
                    {isProcessing ? (
                      'Registrando…'
                    ) : (
                      <>
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                        Cobrar {money(cartTotal)}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {weightProduct && (
        <WeightModal
          product={weightProduct}
          current={cart.find((i) => i.productId === weightProduct.id)?.quantity ?? 0}
          onClose={() => setWeightProduct(null)}
          onConfirm={(kg) => setWeightInCart(weightProduct, kg)}
        />
      )}
    </div>
  );
};

const WeightModal: React.FC<{
  product: Product;
  current: number;
  onClose: () => void;
  onConfirm: (kg: number) => void;
}> = ({ product, current, onClose, onConfirm }) => {
  const [grams, setGrams] = useState(current > 0 ? String(Math.round(current * 1000)) : '');
  const kg = (parseFloat(grams) || 0) / 1000;

  return (
    <Modal
      size="sm"
      title={product.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={() => onConfirm(kg)} disabled={kg <= 0}>
            Agregar {money(kg * product.sellPrice)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-muted nums">
          {money(product.sellPrice)} / kg · quedan {product.stock.toFixed(3)} kg
        </p>
        <div>
          <Label>Peso en gramos</Label>
          <div className="relative">
            <Input
              type="number"
              autoFocus
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              placeholder="Ej: 250"
              className="pr-8 nums text-lg"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">g</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[100, 200, 250, 500, 1000].map((g) => (
            <button
              key={g}
              onClick={() => setGrams(String(g))}
              className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium nums text-ink-soft hover:border-line-strong"
            >
              {g >= 1000 ? '1 kg' : `${g} g`}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
