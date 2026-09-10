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
  RotateCcw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Product, SaleItem, PaymentMethod, Sale, Customer, CashSession } from '../types';
import { PAYMENT_LABELS } from '../types';
import { soundFX } from '../utils/audio';
import { money } from '../utils/format';
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
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

export const QuickSalesPOS: React.FC<Props> = ({
  products,
  customers,
  cashSession,
  pendingScan,
  onScanConsumed,
  onOpenScanner,
  onSaleCompleted,
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

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const quickProducts = useMemo(
    () => [...products].sort((a, b) => b.stock - a.stock).slice(0, 8),
    [products],
  );

  const cartSubtotal = cart.reduce((acc, i) => acc + i.subtotal, 0);
  const discountValue = Math.min(cartSubtotal, Math.max(0, parseFloat(discount) || 0));
  const cartTotal = cartSubtotal - discountValue;
  const cartItemCount = cart.reduce((acc, i) => acc + i.quantity, 0);
  const cartCost = cart.reduce((acc, i) => acc + i.costPrice * i.quantity, 0);

  // --- Agregar al carrito con control de stock ---------------------------------
  const addToCart = (product: Product, quantity = 1) => {
    const inCart = cart.find((i) => i.productId === product.id)?.quantity ?? 0;
    if (inCart + quantity > product.stock) {
      soundFX.playErrorBuzz();
      onToast({ message: `Stock insuficiente de ${product.name} (quedan ${product.stock})`, type: 'warning' });
      return;
    }
    soundFX.playBarcodeBeep();
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx > -1) {
        const updated = [...prev];
        const qty = updated[idx].quantity + quantity;
        updated[idx] = { ...updated[idx], quantity: qty, subtotal: qty * updated[idx].unitPrice };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          barcode: product.barcode,
          name: product.name,
          quantity,
          unitPrice: product.sellPrice,
          costPrice: product.costPrice,
          subtotal: quantity * product.sellPrice,
        },
      ];
    });
    setSearchQuery('');
    setMatches([]);
  };

  // --- Escaneo entrante (cámara o lector físico) ------------------------------
  useEffect(() => {
    if (!pendingScan) return;
    const matched = products.find((p) => p.barcode === pendingScan.code.trim());
    if (matched) {
      addToCart(matched);
      onToast({ message: `✓ ${matched.name} — ${money(matched.sellPrice)}`, type: 'success' }, 1800);
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

  // --- Confirmar venta -------------------------------------------------------
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
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.8 } });
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
    const msg = `*COMPROBANTE KIOSCO*\nFecha: ${time}\n------------------------\n${items}${disc}\n------------------------\n*TOTAL: ${money(
      sale.total,
    )}*\nPago: ${PAYMENT_LABELS[sale.paymentMethod]}\n¡Gracias por su compra!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-24 lg:pb-6">
      {/* Columna izquierda: selección de productos */}
      <div className="lg:col-span-7 space-y-4">
        {!cashSession && (
          <div className="bg-amber-50 border-2 border-amber-600 text-amber-800 px-4 py-2.5 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Caja cerrada — las ventas en efectivo no se sumarán al arqueo. Abrí la caja en la pestaña "Caja".</span>
          </div>
        )}

        <div className="bg-white border-2 border-black p-4 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenScanner}
              className="w-12 h-12 bg-black hover:bg-neutral-800 active:scale-95 text-white flex items-center justify-center border-2 border-black transition-all"
              aria-label="Abrir escáner"
            >
              <Barcode className="w-6 h-6" />
            </button>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-black">Escanear con Celular</p>
              <p className="text-xs font-serif italic text-neutral-600">
                Cámara del teléfono o lector USB/Bluetooth
              </p>
            </div>
          </div>
          <button
            onClick={onOpenScanner}
            className="px-4 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black"
          >
            Escanear
          </button>
        </div>

        <div className="relative">
          <input
            id="input-pos-product-search"
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchEnter}
            placeholder="Buscar por nombre o ingresar código de barras..."
            className="w-full bg-white border-2 border-black px-4 py-3 text-sm placeholder-neutral-400 font-medium outline-none focus:bg-[#FAF9F5]"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setMatches([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase font-bold tracking-wider text-neutral-600 hover:text-black"
            >
              Limpiar
            </button>
          )}
          {matches.length > 0 && (
            <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border-2 border-black shadow-lg divide-y divide-black/10">
              {matches.map((prod) => (
                <button
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className="w-full text-left px-4 py-3 hover:bg-[#F2F2EF] flex items-center justify-between text-sm disabled:opacity-40"
                  disabled={prod.stock === 0}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-black">{prod.name}</span>
                    <span className="text-[11px] text-neutral-600 font-mono">
                      Cod: {prod.barcode} • Stock: {prod.stock}
                    </span>
                  </div>
                  <span className="font-serif italic font-bold text-base text-black">
                    {money(prod.sellPrice)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-black uppercase tracking-[0.2em] flex items-center gap-1.5 opacity-70">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Acceso Rápido</span>
            </h4>
            <span className="text-[11px] font-serif italic text-neutral-600">Mayor stock</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {quickProducts.map((prod) => {
              const isOut = prod.stock === 0;
              return (
                <button
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  disabled={isOut}
                  className={`text-left p-3 border-2 border-black transition-colors flex flex-col justify-between min-h-[96px] ${
                    isOut ? 'bg-[#EAEAE6] opacity-50 cursor-not-allowed' : 'bg-[#F2F2EF] hover:bg-white active:bg-neutral-200'
                  }`}
                >
                  <div>
                    <span className="text-[9px] font-bold text-black/50 uppercase tracking-widest block truncate">
                      {prod.category}
                    </span>
                    <h5 className="text-xs font-bold text-black line-clamp-2 mt-0.5 leading-tight">{prod.name}</h5>
                  </div>
                  <div className="flex items-baseline justify-between mt-2 pt-1 border-t border-black/10">
                    <span className="text-sm sm:text-base font-serif italic font-bold text-black">
                      {money(prod.sellPrice)}
                    </span>
                    <span className={`text-[10px] font-mono font-bold ${isOut ? 'text-red-600' : 'text-neutral-500'}`}>
                      {isOut ? '[ Agotado ]' : `[ ${prod.stock} ]`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {lastSale && (
          <div className="bg-white border-2 border-black p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Venta registrada</h4>
                  <p className="text-xs font-serif italic text-neutral-600">
                    Total: {money(lastSale.total)} • {PAYMENT_LABELS[lastSale.paymentMethod]}
                    {lastSale.changeGiven ? ` • Vuelto: ${money(lastSale.changeGiven)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => shareReceiptWhatsApp(lastSale)}
                  className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider border border-black flex items-center space-x-1"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Comprobante</span>
                </button>
                <button onClick={() => setLastSale(null)} className="text-black hover:opacity-70 text-xs p-1 font-bold">
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha: ticket */}
      <div className="lg:col-span-5 flex flex-col bg-white border-2 border-black">
        <div className="px-4 py-3 border-b-2 border-black flex items-center justify-between bg-[#F2F2EF]">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-widest text-black">Ticket Actual</span>
            {cartItemCount > 0 && (
              <span className="px-2 py-0.5 border border-black bg-white text-[10px] font-mono font-bold">
                {cartItemCount} {cartItemCount === 1 ? 'ítem' : 'ítems'}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs font-bold uppercase tracking-wider text-neutral-600 hover:text-red-600 flex items-center space-x-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Vaciar</span>
            </button>
          )}
        </div>

        <div className="flex-1 max-h-[360px] overflow-y-auto divide-y divide-black/10 p-2">
          {cart.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center p-6 text-neutral-500">
              <Barcode className="w-10 h-10 mb-2 opacity-30 text-black" />
              <p className="text-xs font-bold uppercase tracking-widest text-black/60">Ticket vacío</p>
              <p className="text-xs font-serif italic text-neutral-500 mt-1 max-w-[220px]">
                Escaneá códigos o seleccioná productos para iniciar la venta
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="py-2.5 px-3 hover:bg-[#F9F9F7] flex items-center justify-between gap-3 group">
                <div className="flex-1 min-w-0">
                  <h5 className="text-xs font-bold text-black truncate">{item.name}</h5>
                  <p className="text-[11px] font-serif italic text-neutral-600">{money(item.unitPrice)} c/u</p>
                </div>
                <div className="flex items-center space-x-1 border border-black bg-white px-1 py-0.5">
                  <button
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="w-6 h-6 flex items-center justify-center text-black hover:bg-neutral-200 font-bold"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-black font-mono">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.productId, 1)}
                    className="w-6 h-6 flex items-center justify-center text-black hover:bg-neutral-200 font-bold"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-right min-w-[70px]">
                  <span className="block text-xs font-serif italic font-bold text-black">{money(item.subtotal)}</span>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-[11px] text-neutral-400 hover:text-red-600 p-0.5 inline-block opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3 inline" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t-2 border-black bg-[#F9F9F7] p-4 space-y-3">
            {discountValue > 0 && (
              <div className="flex justify-between text-[11px] font-mono text-neutral-600">
                <span>Subtotal</span>
                <span>{money(cartSubtotal)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-b border-black/10 pb-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-widest text-black/50">
                  Total a cobrar
                </span>
                <span className="text-3xl sm:text-4xl font-black text-black leading-none tracking-tighter font-serif italic">
                  {money(cartTotal)}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-neutral-500">[{cartItemCount} un.]</span>
            </div>

            {!isCheckingOut ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setPaymentMethod('efectivo');
                    setIsCheckingOut(true);
                  }}
                  className="py-3 px-3 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center justify-center space-x-2"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Cobrar Efectivo</span>
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('transferencia');
                    setIsCheckingOut(true);
                  }}
                  className="py-3 px-3 bg-[#F2F2EF] hover:bg-white text-black text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center justify-center space-x-2"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Transfer / QR</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 bg-white p-3 border-2 border-black">
                <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider">Forma de pago</span>
                  <button
                    onClick={() => setIsCheckingOut(false)}
                    className="text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-black"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {[
                    { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                    { id: 'transferencia', label: 'MP / QR', icon: QrCode },
                    { id: 'debito', label: 'Débito', icon: CreditCard },
                    { id: 'credito', label: 'Crédito', icon: CreditCard },
                    { id: 'fiado', label: 'Fiado', icon: UserCheck },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSel = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                        className={`p-2 border text-center flex flex-col items-center justify-center transition-all ${
                          isSel ? 'bg-black text-white border-black font-bold' : 'bg-[#F2F2EF] border-black text-black hover:bg-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 mb-1" />
                        <span className="text-[10px] uppercase tracking-wider truncate max-w-full font-bold">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Descuento */}
                <div className="flex items-center gap-2 pt-2 border-t border-black/10">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-black">Descuento $</label>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="flex-1 bg-white border-2 border-black px-2 py-1.5 text-xs font-mono font-bold outline-none"
                  />
                </div>

                {paymentMethod === 'efectivo' && (
                  <div className="space-y-2 pt-2 border-t border-black/10">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-black font-bold uppercase tracking-wider text-[10px]">Paga con:</label>
                      <span className="font-serif italic text-black text-xs font-bold">Total: {money(cartTotal)}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-serif italic text-sm">$</span>
                      <input
                        type="number"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        placeholder={`${Math.round(cartTotal)}`}
                        className="w-full bg-white border-2 border-black pl-8 pr-3 py-2 text-sm font-mono font-bold outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[1000, 2000, 5000, 10000, 20000].map((bill) => (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => setCashGiven(bill.toString())}
                          className="px-2 py-1 bg-[#F2F2EF] hover:bg-white border border-black text-black text-[10px] font-mono font-bold"
                        >
                          {money(bill)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCashGiven(Math.round(cartTotal).toString())}
                        className="px-2 py-1 bg-black text-white border border-black text-[10px] font-mono font-bold"
                      >
                        Exacto
                      </button>
                    </div>
                    {numericCash > 0 && (
                      <div className="flex items-center justify-between p-2 bg-[#F2F2EF] border border-black">
                        <span className="text-[11px] text-black uppercase font-bold tracking-wider">Vuelto:</span>
                        <span
                          className={`text-sm font-bold font-serif italic ${
                            numericCash >= cartTotal ? 'text-emerald-800' : 'text-red-600'
                          }`}
                        >
                          {numericCash >= cartTotal ? money(changeAmount) : 'Falta dinero'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'fiado' && (
                  <div className="space-y-1 pt-2 border-t border-black/10">
                    <label className="text-xs text-black font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-700" />
                      <span>Cliente (cuenta corriente):</span>
                    </label>
                    {customers.length === 0 ? (
                      <p className="text-[11px] font-serif italic text-red-600">
                        No hay clientes cargados. Creá uno en la pestaña "Fiado".
                      </p>
                    ) : (
                      <select
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        className="w-full bg-white border-2 border-black px-3 py-2 text-xs text-black outline-none font-bold"
                      >
                        <option value="">— Elegí un cliente —</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.balance > 0 ? `(debe ${money(c.balance)})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedCustomer && (
                      <p className="text-[11px] font-mono text-neutral-600">
                        Nueva deuda: {money(selectedCustomer.balance + cartTotal)}
                      </p>
                    )}
                  </div>
                )}

                <input
                  type="text"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Nota (opcional)"
                  className="w-full bg-white border border-black px-3 py-1.5 text-xs outline-none"
                />

                <button
                  onClick={handleProcessSale}
                  disabled={isProcessing || (paymentMethod === 'fiado' && !selectedCustomer)}
                  className="w-full py-3.5 bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-[0.2em] border-2 border-black flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <span>Registrando venta...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar venta ({money(cartTotal)})</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
