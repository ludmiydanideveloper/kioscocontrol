import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Barcode,
  Camera,
  Truck,
  History,
  Minus,
  Package,
  Percent,
  Tag,
  Sparkles,
} from 'lucide-react';
import { Product, StockMovement, PurchaseItem, Supplier } from '../types';
import { CATEGORIES } from '../types';
import { money, marginPct, dateTime } from '../utils/format';
import { generateInternalBarcode, printLabels, type LabelSpec } from '../utils/barcode';
import { Card, Button, IconButton, Input, Select, Label, Badge, Stat, Modal, SectionTitle, Empty, cx } from './ui';
import * as db from '../utils/db';

interface Props {
  products: Product[];
  suppliers: Supplier[];
  onSaveProduct: (product: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onAdjustStock: (productId: string, amount: number, reason: string) => Promise<void>;
  onOpenScannerForBarcode: (onScanned: (barcode: string) => void) => void;
  onRefresh: () => Promise<void>;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

const MOVEMENT_LABELS: Record<string, string> = {
  venta: 'Venta',
  compra: 'Compra',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
  merma: 'Merma',
  alta: 'Alta',
};

export const InventoryManager: React.FC<Props> = ({
  products,
  suppliers,
  onSaveProduct,
  onDeleteProduct,
  onAdjustStock,
  onOpenScannerForBarcode,
  onRefresh,
  onToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isMovementsOpen, setIsMovementsOpen] = useState(false);
  const [isPriceOpen, setIsPriceOpen] = useState(false);
  const [isLabelsOpen, setIsLabelsOpen] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const categories = ['Todos', ...CATEGORIES];

  /** Genera un código interno EAN-13 que todavía no esté en uso. */
  const freshBarcode = (): string => {
    const used = new Set(products.map((p) => p.barcode));
    let seq = products.filter((p) => p.barcode.startsWith('20')).length + 1;
    let code = generateInternalBarcode(seq);
    while (used.has(code)) code = generateInternalBarcode(++seq);
    return code;
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const q = searchTerm.toLowerCase().trim();
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          (p.brand || '').toLowerCase().includes(q);
        const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [products, searchTerm, selectedCategory],
  );

  const openCreate = () => {
    setEditingProduct({
      barcode: '',
      name: '',
      category: 'Golosinas',
      brand: '',
      supplier: '',
      costPrice: 0,
      sellPrice: 0,
      stock: 0,
      minStock: 5,
      unit: 'unidad',
    });
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editingProduct.barcode?.trim() || !editingProduct.name?.trim()) {
      setFormError('El código de barras y el nombre son obligatorios');
      return;
    }
    if ((editingProduct.sellPrice ?? 0) < (editingProduct.costPrice ?? 0)) {
      setFormError('El precio de venta no puede ser menor al costo');
      return;
    }
    try {
      setIsSubmitting(true);
      setFormError(null);
      await onSaveProduct(editingProduct);
      setEditingProduct(null);
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar el producto');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openMovements = async () => {
    setIsMovementsOpen(true);
    try {
      const rows = await db.fetchStockMovements(undefined, 120);
      const nameById = new Map(products.map((p) => [p.id, p.name]));
      setMovements(rows.map((m) => ({ ...m, productName: nameById.get(m.productId) || m.productId })));
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    }
  };

  const totalValuationCost = products.reduce((a, p) => a + p.costPrice * p.stock, 0);
  const totalValuationRetail = products.reduce((a, p) => a + p.sellPrice * p.stock, 0);

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Productos activos" value={products.length} icon={Package} />
        <Stat label="Capital en stock" value={money(totalValuationCost)} hint="a precio de costo" />
        <Stat label="Valor de venta" value={money(totalValuationRetail)} />
        <Stat
          label="Ganancia potencial"
          value={money(totalValuationRetail - totalValuationCost)}
          tone="positive"
        />
      </div>

      <Card pad className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, marca o código…"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" onClick={() => setIsPriceOpen(true)}>
              <Percent className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Precios</span>
            </Button>
            <Button variant="secondary" onClick={() => setIsLabelsOpen(true)}>
              <Tag className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Etiquetas</span>
            </Button>
            <Button variant="secondary" onClick={() => setIsPurchaseOpen(true)}>
              <Truck className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Compra</span>
            </Button>
            <Button variant="secondary" onClick={openMovements}>
              <History className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Movimientos</span>
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nuevo
            </Button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cx(
                'shrink-0 rounded-lg px-3 h-8 text-[13px] font-medium transition-colors',
                selectedCategory === cat
                  ? 'bg-ink text-white'
                  : 'bg-surface-2 text-ink-soft hover:text-ink',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-line">
          <SectionTitle>Catálogo ({filteredProducts.length})</SectionTitle>
        </div>
        {filteredProducts.length === 0 ? (
          <Empty icon={Package} title="Sin resultados" hint="Probá con otra búsqueda o categoría." />
        ) : (
          <div className="divide-y divide-line">
            {filteredProducts.map((p) => {
              const isLow = p.stock <= p.minStock;
              const isOut = p.stock === 0;
              const margin = marginPct(p.costPrice, p.sellPrice);
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-2.5 px-4 py-3 hover:bg-surface-2/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">{p.category}</span>
                      <h4 className="truncate text-sm font-medium">{p.name}</h4>
                      {p.brand && <span className="text-xs text-muted">· {p.brand}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted nums">
                      <span className="flex items-center gap-1">
                        <Barcode className="h-3.5 w-3.5" /> {p.barcode}
                      </span>
                      <span>costo {money(p.costPrice)}</span>
                      <span className="text-ink font-medium">venta {money(p.sellPrice)}</span>
                      <span className={margin < 15 ? 'text-danger' : 'text-brand'}>{margin}% margen</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <IconButton
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onAdjustStock(p.id, -1, 'Ajuste manual')}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </IconButton>
                        <span
                          className={cx(
                            'inline-flex min-w-14 justify-center rounded-md border px-2 py-1 text-[13px] font-semibold nums',
                            isOut
                              ? 'border-danger/20 bg-danger-soft text-danger'
                              : isLow
                              ? 'border-warn/20 bg-warn-soft text-warn'
                              : 'border-line bg-surface-2 text-ink',
                          )}
                        >
                          {p.stock} u.
                        </span>
                        <IconButton
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onAdjustStock(p.id, 1, 'Ajuste manual')}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                      <span className="mt-0.5 block text-xs text-muted nums">mín. {p.minStock}</span>
                    </div>
                    <div className="flex items-center gap-1 border-l border-line pl-2">
                      <IconButton variant="ghost" onClick={() => setEditingProduct({ ...p })} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        className="hover:text-danger"
                        onClick={() => {
                          if (confirm(`¿Dar de baja "${p.name}"? El histórico de ventas se conserva.`))
                            onDeleteProduct(p.id);
                        }}
                        title="Dar de baja"
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {editingProduct && (
        <ProductForm
          product={editingProduct}
          setProduct={setEditingProduct}
          onClose={() => setEditingProduct(null)}
          onSubmit={submitForm}
          onScanBarcode={() =>
            onOpenScannerForBarcode((code) => setEditingProduct((prev) => ({ ...prev, barcode: code })))
          }
          onGenerateBarcode={() => setEditingProduct((prev) => ({ ...prev, barcode: freshBarcode() }))}
          isSubmitting={isSubmitting}
          formError={formError}
        />
      )}

      {isLabelsOpen && (
        <LabelsModal products={products} onClose={() => setIsLabelsOpen(false)} />
      )}

      {isPurchaseOpen && (
        <PurchaseModal
          products={products}
          suppliers={suppliers}
          onClose={() => setIsPurchaseOpen(false)}
          onDone={async () => {
            setIsPurchaseOpen(false);
            await onRefresh();
            onToast({ message: 'Compra registrada — stock actualizado', type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}

      {isPriceOpen && (
        <PriceUpdateModal
          products={products}
          categories={CATEGORIES}
          onClose={() => setIsPriceOpen(false)}
          onDone={async (n) => {
            setIsPriceOpen(false);
            await onRefresh();
            onToast({ message: `${n} precios actualizados`, type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
          onSaveProduct={onSaveProduct}
        />
      )}

      {isMovementsOpen && (
        <MovementsModal
          movements={movements}
          onClose={() => setIsMovementsOpen(false)}
          labels={MOVEMENT_LABELS}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Formulario de producto
// ---------------------------------------------------------------------------
const ProductForm: React.FC<{
  product: Partial<Product>;
  setProduct: React.Dispatch<React.SetStateAction<Partial<Product> | null>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onScanBarcode: () => void;
  onGenerateBarcode: () => void;
  isSubmitting: boolean;
  formError: string | null;
}> = ({ product, setProduct, onClose, onSubmit, onScanBarcode, onGenerateBarcode, isSubmitting, formError }) => {
  const set = (patch: Partial<Product>) => setProduct((prev) => ({ ...prev, ...patch }));

  return (
    <Modal
      size="lg"
      title={product.id ? 'Editar producto' : 'Nuevo producto'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="product-form" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-4">
        {formError && (
          <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {formError}
          </div>
        )}

        <div>
          <Label>Código de barras</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <Input
                required
                value={product.barcode || ''}
                onChange={(e) => set({ barcode: e.target.value })}
                placeholder="7790895000455"
                className="pl-9 nums"
              />
            </div>
            <Button type="button" variant="secondary" onClick={onScanBarcode}>
              <Camera className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Escanear</span>
            </Button>
          </div>
          <button
            type="button"
            onClick={onGenerateBarcode}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            Generar código interno (producto sin código de fábrica)
          </button>
        </div>

        <div>
          <Label>Nombre</Label>
          <Input
            required
            value={product.name || ''}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Alfajor Havanna Mixto"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Categoría</Label>
            <Select
              value={product.category || 'Golosinas'}
              onChange={(e) => set({ category: e.target.value as Product['category'] })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Marca</Label>
            <Input value={product.brand || ''} onChange={(e) => set({ brand: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Proveedor</Label>
            <Input
              value={product.supplier || ''}
              onChange={(e) => set({ supplier: e.target.value })}
              placeholder="Distribuidora"
            />
          </div>
          <div>
            <Label>Se vende</Label>
            <Select
              value={product.priceUnit || 'unit'}
              onChange={(e) => set({ priceUnit: e.target.value as Product['priceUnit'] })}
            >
              <option value="unit">Por unidad</option>
              <option value="kg">Por peso (kg)</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(['costPrice', 'sellPrice'] as const).map((key) => (
            <div key={key}>
              <Label>
                {key === 'costPrice' ? 'Precio costo' : 'Precio venta'}
                {product.priceUnit === 'kg' ? ' / kg' : ''}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  required={key === 'sellPrice'}
                  value={product[key] ?? 0}
                  onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 } as Partial<Product>)}
                  className="pl-7 nums"
                />
              </div>
            </div>
          ))}
        </div>

        {(product.sellPrice ?? 0) > 0 && (
          <p className="text-xs text-muted nums">
            Margen {marginPct(product.costPrice ?? 0, product.sellPrice ?? 0)}% · ganancia unitaria{' '}
            {money((product.sellPrice ?? 0) - (product.costPrice ?? 0))}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Stock actual {product.priceUnit === 'kg' ? '(kg)' : ''}</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={product.stock ?? 0}
              onChange={(e) => set({ stock: parseFloat(e.target.value) || 0 })}
              className="nums"
            />
          </div>
          <div>
            <Label>Alerta mínima</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={product.minStock ?? 5}
              onChange={(e) => set({ minStock: parseFloat(e.target.value) || 0 })}
              className="nums"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Compra a proveedor
// ---------------------------------------------------------------------------
const PurchaseModal: React.FC<{
  products: Product[];
  suppliers: Supplier[];
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}> = ({ products, suppliers, onClose, onDone, onError }) => {
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState(true);
  const [rows, setRows] = useState<PurchaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name || null;

  const results = search.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search.trim()),
        )
        .slice(0, 6)
    : [];

  const addRow = (p: Product) => {
    if (rows.some((r) => r.productId === p.id)) return;
    setRows((prev) => [
      ...prev,
      { productId: p.id, name: p.name, quantity: 1, costPrice: p.costPrice, subtotal: p.costPrice },
    ]);
    setSearch('');
  };

  const updateRow = (id: string, patch: Partial<PurchaseItem>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.productId !== id) return r;
        const merged = { ...r, ...patch };
        merged.subtotal = merged.quantity * merged.costPrice;
        return merged;
      }),
    );

  const total = rows.reduce((a, r) => a + r.subtotal, 0);

  const save = async () => {
    if (rows.length === 0) return;
    if (!paid && !supplierId) {
      onError('Elegí un proveedor para dejar la compra en cuenta corriente');
      return;
    }
    try {
      setIsSaving(true);
      await db.registerPurchase({
        supplier: supplierName,
        supplierId: supplierId || null,
        items: rows,
        total,
        paid,
        notes: notes || null,
      });
      await onDone();
    } catch (err: any) {
      onError(err.message || 'No se pudo registrar la compra');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Registrar compra a proveedor"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            <span className="block text-xs text-muted">Total compra</span>
            <span className="text-lg font-semibold nums">{money(total)}</span>
          </div>
          <Button variant="primary" onClick={save} disabled={isSaving || rows.length === 0}>
            {isSaving ? 'Guardando…' : 'Registrar compra'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Proveedor</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Sin especificar</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Pago</Label>
            <Select value={paid ? 'paid' : 'account'} onChange={(e) => setPaid(e.target.value === 'paid')}>
              <option value="paid">Pagada</option>
              <option value="account">En cuenta corriente</option>
            </Select>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Agregar producto…"
            className="pl-9"
          />
          {results.length > 0 && (
            <div className="absolute z-30 inset-x-0 top-full mt-1 overflow-hidden rounded-lg border border-line bg-surface pop-shadow">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addRow(p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-surface-2"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted nums">stock {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-line">
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted">
              Buscá y agregá productos para armar la compra.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div key={r.productId} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="flex-1 truncate font-medium">{r.name}</span>
                  <Input
                    type="number"
                    min="1"
                    value={r.quantity}
                    onChange={(e) => updateRow(r.productId, { quantity: parseInt(e.target.value, 10) || 0 })}
                    className="h-8 w-16 text-center nums"
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={r.costPrice}
                      onChange={(e) => updateRow(r.productId, { costPrice: parseFloat(e.target.value) || 0 })}
                      className="h-8 w-24 pl-5 text-center nums"
                    />
                  </div>
                  <span className="w-20 text-right font-semibold nums">{money(r.subtotal)}</span>
                  <button
                    onClick={() => setRows((prev) => prev.filter((x) => x.productId !== r.productId))}
                    className="text-muted hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nota / N° de remito (opcional)"
        />
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Actualización masiva de precios (%)
// ---------------------------------------------------------------------------
const PriceUpdateModal: React.FC<{
  products: Product[];
  categories: readonly string[];
  onClose: () => void;
  onDone: (n: number) => Promise<void>;
  onError: (m: string) => void;
  onSaveProduct: (p: Partial<Product>) => Promise<void>;
}> = ({ products, categories, onClose, onDone, onError, onSaveProduct }) => {
  const [pct, setPct] = useState('');
  const [category, setCategory] = useState('Todos');
  const [target, setTarget] = useState<'sell' | 'both'>('sell');
  const [round, setRound] = useState(true);
  const [busy, setBusy] = useState(false);

  const value = parseFloat(pct) || 0;
  const affected = products.filter((p) => category === 'Todos' || p.category === category);
  const factor = 1 + value / 100;
  const roundTo = (n: number) => (round ? Math.round(n / 10) * 10 : Math.round(n));

  const apply = async () => {
    if (value === 0) return;
    try {
      setBusy(true);
      for (const p of affected) {
        const patch: Partial<Product> = { id: p.id, sellPrice: roundTo(p.sellPrice * factor) };
        if (target === 'both') patch.costPrice = roundTo(p.costPrice * factor);
        await onSaveProduct(patch);
      }
      await onDone(affected.length);
    } catch (err: any) {
      onError(err.message || 'No se pudieron actualizar los precios');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Actualizar precios"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={apply} disabled={busy || value === 0}>
            {busy ? 'Aplicando…' : `Aplicar a ${affected.length}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Ajuste porcentual</Label>
          <div className="relative">
            <Input
              type="number"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="Ej: 12 (o -5 para bajar)"
              className="pr-7 nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Categoría</Label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="Todos">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Aplicar a</Label>
            <Select value={target} onChange={(e) => setTarget(e.target.value as 'sell' | 'both')}>
              <option value="sell">Sólo precio de venta</option>
              <option value="both">Venta y costo</option>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          <input type="checkbox" checked={round} onChange={(e) => setRound(e.target.checked)} />
          Redondear a la decena más cercana
        </label>
        {value !== 0 && affected.length > 0 && (
          <p className="text-xs text-muted nums">
            Ejemplo: {affected[0].name} {money(affected[0].sellPrice)} →{' '}
            {money(roundTo(affected[0].sellPrice * factor))}
          </p>
        )}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Movimientos de stock
// ---------------------------------------------------------------------------
const MovementsModal: React.FC<{
  movements: StockMovement[];
  onClose: () => void;
  labels: Record<string, string>;
}> = ({ movements, onClose, labels }) => (
  <Modal size="lg" title="Movimientos de stock" onClose={onClose}>
    {movements.length === 0 ? (
      <p className="py-6 text-center text-[13px] text-muted">Sin movimientos registrados.</p>
    ) : (
      <div className="divide-y divide-line -my-1">
        {movements.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2.5 text-[13px]">
            <div className="min-w-0">
              <span className="block truncate font-medium">{m.productName}</span>
              <span className="text-xs text-muted nums">
                {dateTime(m.createdAt)} · {labels[m.type] || m.type}
                {m.reason ? ` · ${m.reason}` : ''}
              </span>
            </div>
            <div className="pl-3 text-right">
              <span className={cx('font-semibold nums', m.quantity >= 0 ? 'text-brand' : 'text-danger')}>
                {m.quantity >= 0 ? '+' : ''}
                {m.quantity}
              </span>
              <span className="block text-xs text-muted nums">→ {m.stockAfter}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </Modal>
);

// ---------------------------------------------------------------------------
// Impresión de etiquetas de código de barras
// ---------------------------------------------------------------------------
const LabelsModal: React.FC<{ products: Product[]; onClose: () => void }> = ({ products, onClose }) => {
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});

  const results = search.trim()
    ? products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search.trim()),
        )
        .slice(0, 8)
    : [];

  const selected: LabelSpec[] = products
    .filter((p) => (qty[p.id] || 0) > 0)
    .map((p) => ({ product: p, qty: qty[p.id] }));
  const totalLabels = selected.reduce((a, s) => a + s.qty, 0);

  const bump = (id: string, delta: number) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));

  return (
    <Modal
      size="lg"
      title="Etiquetas de código de barras"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[13px] text-muted nums">
            {totalLabels} etiqueta{totalLabels === 1 ? '' : 's'}
          </span>
          <Button variant="primary" disabled={totalLabels === 0} onClick={() => printLabels(selected)}>
            <Tag className="h-3.5 w-3.5" strokeWidth={2} />
            Imprimir
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Elegí productos y cuántas etiquetas de cada uno. Se imprime una hoja A4 con 3 columnas.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto para agregar…"
            className="pl-9"
          />
        </div>

        {results.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line divide-y divide-line">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  bump(p.id, 1);
                  setSearch('');
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-surface-2"
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-muted nums">{p.barcode}</span>
              </button>
            ))}
          </div>
        )}

        {selected.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Todavía no elegiste productos.</p>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line">
            {selected.map(({ product: p, qty: n }) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="text-xs text-muted nums">{p.barcode}</span>
                </div>
                <div className="flex items-center rounded-lg border border-line">
                  <button onClick={() => bump(p.id, -1)} className="flex h-7 w-7 items-center justify-center text-ink-soft hover:text-ink">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center font-semibold nums">{n}</span>
                  <button onClick={() => bump(p.id, 1)} className="flex h-7 w-7 items-center justify-center text-ink-soft hover:text-ink">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
