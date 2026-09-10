import React, { useState } from 'react';
import { 
  AlertTriangle, 
  PackageX, 
  Plus, 
  Check, 
  Copy, 
  Truck, 
  Filter
} from 'lucide-react';
import { Product } from '../types';

interface LowStockAlertsProps {
  products: Product[];
  onAdjustStock: (productId: string, amount: number, reason: string) => Promise<void>;
  onOpenProductModal?: (product?: Product) => void;
}

export const LowStockAlerts: React.FC<LowStockAlertsProps> = ({
  products,
  onAdjustStock,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'out' | 'low'>('all');
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [customAmountMap, setCustomAmountMap] = useState<Record<string, string>>({});
  const [copiedSupplierList, setCopiedSupplierList] = useState(false);

  // Filter products needing attention
  const alertProducts = products.filter(p => p.stock <= p.minStock);
  const outOfStock = alertProducts.filter(p => p.stock === 0);
  const lowStock = alertProducts.filter(p => p.stock > 0 && p.stock <= p.minStock);

  const displayedProducts = filterMode === 'all' 
    ? alertProducts 
    : filterMode === 'out' 
      ? outOfStock 
      : lowStock;

  const handleQuickRestock = async (productId: string, amount: number) => {
    try {
      setRestockingId(productId);
      await onAdjustStock(productId, amount, 'Reposición rápida');
    } catch (err) {
      console.error(err);
    } finally {
      setRestockingId(null);
    }
  };

  const handleCustomRestock = async (productId: string) => {
    const val = parseInt(customAmountMap[productId] || '', 10);
    if (!val || isNaN(val) || val <= 0) return;
    await handleQuickRestock(productId, val);
    setCustomAmountMap(prev => ({ ...prev, [productId]: '' }));
  };

  const copySupplierOrderList = () => {
    if (alertProducts.length === 0) return;
    const lines = [
      '📦 *PEDIDO PARA DISTRIBUIDOR / PROVEEDOR*',
      `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
      '----------------------------------------',
      ...alertProducts.map(p => {
        const needed = Math.max(10, (p.minStock * 2) - p.stock);
        return `• [${p.category.toUpperCase()}] ${p.name}\n  Cod: ${p.barcode} | Stock actual: ${p.stock} | Pedir: *${needed} un.*`;
      }),
      '----------------------------------------',
      `Total artículos a reponer: ${alertProducts.length}`
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSupplierList(true);
    setTimeout(() => setCopiedSupplierList(false), 3000);
  };

  return (
    <div id="low-stock-alerts-view" className="space-y-4 pb-20 lg:pb-6">
      {/* Top Banner with Supplier Order Action (Editorial Header) */}
      <div className="bg-white border-2 border-black p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-serif italic font-bold text-black">
              Gestión de Stock Bajo y Reposición
            </h3>
          </div>
          <p className="text-xs text-neutral-600 mt-1">
            Artículos que alcanzaron o están por debajo de su umbral mínimo configurado.
          </p>
        </div>

        {alertProducts.length > 0 && (
          <button
            id="btn-copy-supplier-order"
            onClick={copySupplierOrderList}
            className="self-start sm:self-auto px-4 py-2.5 bg-black hover:bg-neutral-800 active:scale-95 text-white text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center space-x-2 transition-all cursor-pointer"
          >
            {copiedSupplierList ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>¡Pedido Copiado al Portapapeles!</span>
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                <Copy className="w-3.5 h-3.5" />
                <span>Generar Pedido Proveedor</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Metrics Summary Chips & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center space-x-1.5 transition-all ${
              filterMode === 'all'
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-[#F2F2EF]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Todos en Alerta ({alertProducts.length})</span>
          </button>

          <button
            onClick={() => setFilterMode('out')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center space-x-1.5 transition-all ${
              filterMode === 'out'
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-[#F2F2EF]'
            }`}
          >
            <PackageX className="w-3.5 h-3.5" />
            <span>Sin Stock ({outOfStock.length})</span>
          </button>

          <button
            onClick={() => setFilterMode('low')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center space-x-1.5 transition-all ${
              filterMode === 'low'
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-[#F2F2EF]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Próximos a Agotarse ({lowStock.length})</span>
          </button>
        </div>
      </div>

      {/* Alert Items List */}
      {displayedProducts.length === 0 ? (
        <div className="bg-white border-2 border-black p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 bg-black text-white flex items-center justify-center mb-3">
            <Check className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold uppercase tracking-widest text-black">¡Inventario en Niveles Óptimos!</h4>
          <p className="text-xs font-serif italic text-neutral-600 mt-1 max-w-sm">
            No hay productos que requieran reposición inmediata en esta categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {displayedProducts.map((product) => {
            const isZero = product.stock === 0;
            const isWorking = restockingId === product.id;

            return (
              <div
                key={product.id}
                className={`p-4 border-2 border-black bg-white flex flex-col justify-between transition-all ${
                  isZero ? 'bg-red-50/20' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono px-2 py-0.5 border border-black bg-[#F2F2EF] text-black font-bold uppercase tracking-widest">
                        {product.category}
                      </span>
                      <h4 className="text-sm font-bold text-black mt-1.5">{product.name}</h4>
                      <p className="text-[11px] text-neutral-600 font-mono mt-0.5">
                        Cod: {product.barcode}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 border-2 border-black text-xs font-bold font-mono uppercase ${
                          isZero
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isZero ? 'Agotado (0)' : `Stock: ${product.stock}`}
                      </span>
                      <span className="block text-[10px] font-mono text-neutral-500 mt-1 uppercase">
                        Mínimo: {product.minStock} un.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Restock Action Buttons */}
                <div className="mt-4 pt-3 border-t border-black/10">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">Reponer rápido:</span>
                    
                    <div className="flex items-center space-x-1.5">
                      {[5, 10, 24].map((amt) => (
                        <button
                          key={amt}
                          disabled={isWorking}
                          onClick={() => handleQuickRestock(product.id, amt)}
                          className="px-2.5 py-1 bg-[#F2F2EF] hover:bg-black hover:text-white text-black text-xs font-bold font-mono border border-black active:scale-95 transition-all"
                        >
                          +{amt}
                        </button>
                      ))}

                      {/* Custom quantity input */}
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          value={customAmountMap[product.id] || ''}
                          onChange={(e) => setCustomAmountMap({ ...customAmountMap, [product.id]: e.target.value })}
                          placeholder="Otro"
                          className="w-14 bg-white border border-black px-2 py-1 text-xs text-black font-mono text-center focus:outline-none"
                        />
                        <button
                          onClick={() => handleCustomRestock(product.id)}
                          disabled={isWorking || !customAmountMap[product.id]}
                          className="p-1.5 bg-black hover:bg-neutral-800 disabled:opacity-40 text-white border border-black text-xs"
                          title="Sumar cantidad personalizada"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
