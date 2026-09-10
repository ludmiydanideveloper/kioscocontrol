import React, { useState, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit3,
  Trash2,
  Barcode,
  Camera,
  Filter,
  DollarSign,
  Truck,
  History,
  X,
} from 'lucide-react';
import { Product, StockMovement, PurchaseItem } from '../types';
import { CATEGORIES } from '../types';
import { money, marginPct, dateTime } from '../utils/format';
import * as db from '../utils/db';

interface Props {
  products: Product[];
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isMovementsOpen, setIsMovementsOpen] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const categories = ['Todos', ...CATEGORIES];

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const q = searchTerm.toLowerCase().trim();
        const matchesSearch =
          !q || p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.brand || '').toLowerCase().includes(q);
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
    setIsFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setFormError(null);
    setIsFormOpen(true);
  };

  const scanBarcodeForForm = () =>
    onOpenScannerForBarcode((code) => setEditingProduct((prev) => ({ ...prev, barcode: code })));

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
      setIsFormOpen(false);
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
      {/* Resumen + acciones */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border-2 border-black p-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Productos activos</span>
          <p className="text-2xl font-black font-serif italic">{products.length}</p>
        </div>
        <div className="bg-white border-2 border-black p-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Capital en stock (costo)</span>
          <p className="text-2xl font-black font-serif italic">{money(totalValuationCost)}</p>
        </div>
        <div className="bg-white border-2 border-black p-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Valor de venta</span>
          <p className="text-2xl font-black font-serif italic">{money(totalValuationRetail)}</p>
        </div>
        <div className="bg-white border-2 border-black p-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Ganancia potencial</span>
          <p className="text-2xl font-black font-serif italic text-emerald-800">
            {money(totalValuationRetail - totalValuationCost)}
          </p>
        </div>
      </div>

      <div className="bg-white border-2 border-black p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, marca o código..."
              className="w-full bg-white border-2 border-black pl-10 pr-4 py-2.5 text-xs sm:text-sm placeholder-neutral-400 font-medium focus:bg-[#FAF9F5] outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsPurchaseOpen(true)}
              className="px-3 py-2.5 bg-[#F2F2EF] hover:bg-white text-black text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center gap-1.5"
            >
              <Truck className="w-4 h-4" />
              <span className="hidden sm:inline">Compra</span>
            </button>
            <button
              onClick={openMovements}
              className="px-3 py-2.5 bg-[#F2F2EF] hover:bg-white text-black text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center gap-1.5"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Movimientos</span>
            </button>
            <button
              onClick={openCreate}
              className="px-4 py-2.5 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo</span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <Filter className="w-3.5 h-3.5 text-neutral-500 mr-1 flex-shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 whitespace-nowrap text-xs font-bold uppercase tracking-wider border transition-colors ${
                selectedCategory === cat
                  ? 'bg-black text-white border-black'
                  : 'bg-[#F2F2EF] text-black border-black/40 hover:border-black'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border-2 border-black overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span>Catálogo ({filteredProducts.length})</span>
          <span className="text-[11px] font-mono text-neutral-600">Kiosco Central</span>
        </div>

        <div className="divide-y divide-black/10">
          {filteredProducts.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 font-serif italic text-xs">
              No se encontraron productos.
            </div>
          ) : (
            filteredProducts.map((p) => {
              const isLow = p.stock <= p.minStock;
              const isOut = p.stock === 0;
              return (
                <div
                  key={p.id}
                  className="p-3.5 sm:px-4 sm:py-3 hover:bg-[#F9F9F7] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono uppercase bg-[#F2F2EF] border border-black px-1.5 py-0.5 font-bold">
                        {p.category}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-black truncate">{p.name}</h4>
                      {p.brand && <span className="text-[10px] text-neutral-500 font-mono">· {p.brand}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-neutral-600 font-mono">
                      <span className="flex items-center gap-1">
                        <Barcode className="w-3.5 h-3.5 text-black" />
                        {p.barcode}
                      </span>
                      <span>Costo: {money(p.costPrice)}</span>
                      <span className="text-black font-serif italic font-bold text-xs">Venta: {money(p.sellPrice)}</span>
                      <span
                        className={`px-1 border ${
                          marginPct(p.costPrice, p.sellPrice) < 15
                            ? 'border-red-400 text-red-600'
                            : 'border-emerald-400 text-emerald-700'
                        }`}
                      >
                        {marginPct(p.costPrice, p.sellPrice)}% margen
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-3">
                    <div className="text-right">
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => onAdjustStock(p.id, -1, 'Ajuste manual')}
                          className="w-6 h-6 border border-black bg-[#F2F2EF] hover:bg-black hover:text-white flex items-center justify-center text-xs font-bold"
                        >
                          -
                        </button>
                        <span
                          className={`px-2.5 py-0.5 border border-black text-xs font-bold font-mono uppercase ${
                            isOut ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-800' : 'bg-[#F2F2EF] text-black'
                          }`}
                        >
                          {p.stock} un.
                        </span>
                        <button
                          onClick={() => onAdjustStock(p.id, 1, 'Ajuste manual')}
                          className="w-6 h-6 border border-black bg-[#F2F2EF] hover:bg-black hover:text-white flex items-center justify-center text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                      <span className="block text-[10px] font-mono text-neutral-500 mt-0.5 uppercase">
                        Mínimo: {p.minStock}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 pl-2 border-l border-black/20">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 text-black hover:bg-[#F2F2EF] border border-black/30 hover:border-black"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Dar de baja "${p.name}"? El histórico de ventas se conserva.`)) onDeleteProduct(p.id);
                        }}
                        className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-red-50 border border-black/30 hover:border-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isFormOpen && editingProduct && (
        <ProductForm
          product={editingProduct}
          setProduct={setEditingProduct}
          onClose={() => setIsFormOpen(false)}
          onSubmit={submitForm}
          onScanBarcode={scanBarcodeForForm}
          isSubmitting={isSubmitting}
          formError={formError}
        />
      )}

      {isPurchaseOpen && (
        <PurchaseModal
          products={products}
          onClose={() => setIsPurchaseOpen(false)}
          onDone={async () => {
            setIsPurchaseOpen(false);
            await onRefresh();
            onToast({ message: 'Compra registrada — stock actualizado', type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}

      {isMovementsOpen && (
        <MovementsModal movements={movements} onClose={() => setIsMovementsOpen(false)} labels={MOVEMENT_LABELS} />
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
  isSubmitting: boolean;
  formError: string | null;
}> = ({ product, setProduct, onClose, onSubmit, onScanBarcode, isSubmitting, formError }) => {
  const set = (patch: Partial<Product>) => setProduct((prev) => ({ ...prev, ...patch }));
  const field = 'w-full bg-white border-2 border-black px-3 py-2 text-xs sm:text-sm text-black outline-none focus:bg-[#FAF9F5]';
  const label = 'block text-xs font-bold uppercase tracking-wider text-black mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider">{product.id ? 'Editar producto' : 'Nuevo producto'}</h3>
          </div>
          <button onClick={onClose} className="text-black hover:opacity-60 text-sm font-bold p-1">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4 overflow-y-auto">
          {formError && (
            <div className="p-3 bg-red-100 border border-red-500 text-red-800 text-xs font-bold">{formError}</div>
          )}

          <div>
            <label className={label}>Código de barras *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  required
                  value={product.barcode || ''}
                  onChange={(e) => set({ barcode: e.target.value })}
                  placeholder="7790895000455"
                  className={`${field} pl-9 font-mono`}
                />
              </div>
              <button
                type="button"
                onClick={onScanBarcode}
                className="px-3.5 py-2 bg-black hover:bg-neutral-800 text-white border-2 border-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                Escanear
              </button>
            </div>
          </div>

          <div>
            <label className={label}>Nombre *</label>
            <input
              type="text"
              required
              value={product.name || ''}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Alfajor Havanna Mixto"
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Categoría</label>
              <select
                value={product.category || 'Golosinas'}
                onChange={(e) => set({ category: e.target.value as Product['category'] })}
                className={`${field} font-bold uppercase text-[11px]`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Marca</label>
              <input type="text" value={product.brand || ''} onChange={(e) => set({ brand: e.target.value })} className={field} />
            </div>
          </div>

          <div>
            <label className={label}>Proveedor</label>
            <input
              type="text"
              value={product.supplier || ''}
              onChange={(e) => set({ supplier: e.target.value })}
              placeholder="Distribuidora / Mayorista"
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Precio costo ($)</label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={product.costPrice ?? 0}
                  onChange={(e) => set({ costPrice: parseFloat(e.target.value) || 0 })}
                  className={`${field} pl-8 font-mono font-bold`}
                />
              </div>
            </div>
            <div>
              <label className={label}>Precio venta ($) *</label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={product.sellPrice ?? 0}
                  onChange={(e) => set({ sellPrice: parseFloat(e.target.value) || 0 })}
                  className={`${field} pl-8 font-mono font-bold`}
                />
              </div>
            </div>
          </div>

          {(product.sellPrice ?? 0) > 0 && (
            <p className="text-[11px] font-mono text-neutral-600">
              Margen: {marginPct(product.costPrice ?? 0, product.sellPrice ?? 0)}% · Ganancia unitaria:{' '}
              {money((product.sellPrice ?? 0) - (product.costPrice ?? 0))}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Stock actual</label>
              <input
                type="number"
                min="0"
                value={product.stock ?? 0}
                onChange={(e) => set({ stock: parseInt(e.target.value, 10) || 0 })}
                className={`${field} font-mono font-bold`}
              />
            </div>
            <div>
              <label className={label}>Alerta mínima</label>
              <input
                type="number"
                min="0"
                value={product.minStock ?? 5}
                onChange={(e) => set({ minStock: parseInt(e.target.value, 10) || 0 })}
                className={`${field} font-mono font-bold`}
              />
            </div>
          </div>

          <div className="pt-3 border-t-2 border-black flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-black text-black hover:bg-[#F2F2EF] text-xs font-bold uppercase tracking-wider"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal de compra a proveedor
// ---------------------------------------------------------------------------
const PurchaseModal: React.FC<{
  products: Product[];
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}> = ({ products, onClose, onDone, onError }) => {
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<PurchaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    try {
      setIsSaving(true);
      await db.registerPurchase({ supplier: supplier || null, items: rows, total, notes: notes || null });
      await onDone();
    } catch (err: any) {
      onError(err.message || 'No se pudo registrar la compra');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider">Registrar compra a proveedor</h3>
          </div>
          <button onClick={onClose} className="text-black hover:opacity-60 font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Proveedor / distribuidora"
            className="w-full bg-white border-2 border-black px-3 py-2 text-sm outline-none"
          />

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Agregar producto a la compra..."
              className="w-full bg-white border-2 border-black pl-9 pr-3 py-2 text-sm outline-none"
            />
            {results.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border-2 border-black divide-y divide-black/10">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addRow(p)}
                    className="w-full text-left px-3 py-2 hover:bg-[#F2F2EF] text-xs flex justify-between"
                  >
                    <span className="font-bold">{p.name}</span>
                    <span className="font-mono text-neutral-600">stock {p.stock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-2 border-black divide-y divide-black/10">
            {rows.length === 0 ? (
              <p className="p-4 text-center text-xs font-serif italic text-neutral-500">
                Sin ítems. Buscá y agregá productos arriba.
              </p>
            ) : (
              rows.map((r) => (
                <div key={r.productId} className="p-2.5 flex items-center gap-2 text-xs">
                  <span className="flex-1 font-bold truncate">{r.name}</span>
                  <label className="text-[10px] uppercase text-neutral-500">Cant</label>
                  <input
                    type="number"
                    min="1"
                    value={r.quantity}
                    onChange={(e) => updateRow(r.productId, { quantity: parseInt(e.target.value, 10) || 0 })}
                    className="w-14 border border-black px-1.5 py-1 font-mono text-center"
                  />
                  <label className="text-[10px] uppercase text-neutral-500">Costo</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={r.costPrice}
                    onChange={(e) => updateRow(r.productId, { costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-20 border border-black px-1.5 py-1 font-mono text-center"
                  />
                  <span className="w-20 text-right font-bold font-serif italic">{money(r.subtotal)}</span>
                  <button
                    onClick={() => setRows((prev) => prev.filter((x) => x.productId !== r.productId))}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota / N° remito (opcional)"
            className="w-full bg-white border border-black px-3 py-1.5 text-xs outline-none"
          />
        </div>

        <div className="px-5 py-4 border-t-2 border-black bg-[#F9F9F7] flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-black/50 block">Total compra</span>
            <span className="text-2xl font-black font-serif italic">{money(total)}</span>
          </div>
          <button
            onClick={save}
            disabled={isSaving || rows.length === 0}
            className="px-5 py-3 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal de movimientos de stock
// ---------------------------------------------------------------------------
const MovementsModal: React.FC<{
  movements: StockMovement[];
  onClose: () => void;
  labels: Record<string, string>;
}> = ({ movements, onClose, labels }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-xl bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[85vh]">
      <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
            <History className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wider">Movimientos de stock</h3>
        </div>
        <button onClick={onClose} className="text-black hover:opacity-60 font-bold p-1">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="overflow-y-auto divide-y divide-black/10">
        {movements.length === 0 ? (
          <p className="p-8 text-center text-xs font-serif italic text-neutral-500">Sin movimientos registrados.</p>
        ) : (
          movements.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
              <div className="min-w-0">
                <span className="font-bold truncate block">{m.productName}</span>
                <span className="text-[11px] font-mono text-neutral-600">
                  {dateTime(m.createdAt)} · {labels[m.type] || m.type}
                  {m.reason ? ` · ${m.reason}` : ''}
                </span>
              </div>
              <div className="text-right pl-3">
                <span
                  className={`font-mono font-bold ${m.quantity >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                >
                  {m.quantity >= 0 ? '+' : ''}
                  {m.quantity}
                </span>
                <span className="block text-[10px] font-mono text-neutral-500">→ {m.stockAfter}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);
