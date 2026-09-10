import React, { useState } from 'react';
import { AlertTriangle, Check, Truck, Plus } from 'lucide-react';
import { Product } from '../types';
import { Card, Button, Input, Badge, Empty, Segmented, SectionTitle, cx } from './ui';

interface LowStockAlertsProps {
  products: Product[];
  onAdjustStock: (productId: string, amount: number, reason: string) => Promise<void>;
}

export const LowStockAlerts: React.FC<LowStockAlertsProps> = ({ products, onAdjustStock }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'out' | 'low'>('all');
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [customAmountMap, setCustomAmountMap] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const alertProducts = products.filter((p) => p.stock <= p.minStock);
  const outOfStock = alertProducts.filter((p) => p.stock === 0);
  const lowStock = alertProducts.filter((p) => p.stock > 0);

  const displayed =
    filterMode === 'all' ? alertProducts : filterMode === 'out' ? outOfStock : lowStock;

  const restock = async (productId: string, amount: number) => {
    try {
      setRestockingId(productId);
      await onAdjustStock(productId, amount, 'Reposición rápida');
    } catch (err) {
      console.error(err);
    } finally {
      setRestockingId(null);
    }
  };

  const customRestock = async (productId: string) => {
    const val = parseInt(customAmountMap[productId] || '', 10);
    if (!val || val <= 0) return;
    await restock(productId, val);
    setCustomAmountMap((prev) => ({ ...prev, [productId]: '' }));
  };

  const copySupplierOrder = () => {
    if (alertProducts.length === 0) return;
    const lines = [
      `Pedido a proveedor — ${new Date().toLocaleDateString('es-AR')}`,
      '',
      ...alertProducts.map((p) => {
        const needed = Math.max(10, p.minStock * 2 - p.stock);
        return `• ${p.name} (${p.category})\n  ${p.barcode} · stock ${p.stock} · pedir ${needed} u.`;
      }),
      '',
      `Total: ${alertProducts.length} artículos`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <Card pad className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle icon={AlertTriangle}>Reposición de stock</SectionTitle>
          <p className="mt-1 text-[13px] text-muted">
            Artículos en o por debajo de su mínimo configurado.
          </p>
        </div>
        {alertProducts.length > 0 && (
          <Button variant="primary" onClick={copySupplierOrder}>
            {copied ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} /> Copiado
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2} /> Copiar pedido
              </>
            )}
          </Button>
        )}
      </Card>

      <Segmented
        value={filterMode}
        onChange={setFilterMode}
        options={[
          { value: 'all', label: `En alerta (${alertProducts.length})` },
          { value: 'out', label: `Agotados (${outOfStock.length})` },
          { value: 'low', label: `Por agotarse (${lowStock.length})` },
        ]}
      />

      {displayed.length === 0 ? (
        <Card>
          <Empty icon={Check} title="Todo en niveles óptimos" hint="Nada que reponer en esta vista." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {displayed.map((product) => {
            const isZero = product.stock === 0;
            const working = restockingId === product.id;
            return (
              <Card key={product.id} pad className="flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs text-muted">{product.category}</span>
                    <h4 className="text-sm font-medium">{product.name}</h4>
                    <p className="text-xs text-muted nums">{product.barcode}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge tone={isZero ? 'red' : 'amber'}>
                      {isZero ? 'Agotado' : `Stock ${product.stock}`}
                    </Badge>
                    <span className="mt-1 block text-xs text-muted nums">mín. {product.minStock}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="text-[13px] text-muted">Reponer</span>
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 24].map((amt) => (
                      <button
                        key={amt}
                        disabled={working}
                        onClick={() => restock(product.id, amt)}
                        className="rounded-lg border border-line px-2.5 h-8 text-[13px] font-medium nums text-ink-soft hover:border-line-strong disabled:opacity-40"
                      >
                        +{amt}
                      </button>
                    ))}
                    <Input
                      type="number"
                      value={customAmountMap[product.id] || ''}
                      onChange={(e) =>
                        setCustomAmountMap({ ...customAmountMap, [product.id]: e.target.value })
                      }
                      placeholder="Otro"
                      className="h-8 w-16 text-center nums"
                    />
                    <button
                      onClick={() => customRestock(product.id)}
                      disabled={working || !customAmountMap[product.id]}
                      className={cx(
                        'flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white',
                        'disabled:opacity-40',
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
