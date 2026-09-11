import React, { useState, useMemo } from 'react';
import { Truck, Plus, Search, Pencil, Trash2, MessageCircle, History } from 'lucide-react';
import { Supplier, SupplierPayment, CashSession, PaymentMethod, Purchase } from '../types';
import { PAYMENT_LABELS } from '../types';
import { money, dateTime } from '../utils/format';
import { Card, Button, IconButton, Input, Label, Badge, Stat, Modal, SectionTitle, Empty, cx } from './ui';
import * as db from '../utils/db';

interface Props {
  suppliers: Supplier[];
  cashSession: CashSession | null;
  onRefresh: () => Promise<void>;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

export const SuppliersView: React.FC<Props> = ({ suppliers, cashSession, onRefresh, onToast }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [historyOf, setHistoryOf] = useState<Supplier | null>(null);

  const filtered = useMemo(
    () =>
      [...suppliers]
        .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.balance - a.balance),
    [suppliers, search],
  );

  const totalPayable = suppliers.reduce((a, s) => a + Math.max(0, s.balance), 0);
  const creditorCount = suppliers.filter((s) => s.balance > 0).length;

  const save = async (data: Partial<Supplier>) => {
    if (!data.name?.trim()) {
      onToast({ message: 'El nombre es obligatorio', type: 'warning' });
      return;
    }
    try {
      await db.saveSupplier(data);
      setEditing(null);
      await onRefresh();
      onToast({ message: 'Proveedor guardado', type: 'success' });
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    }
  };

  const message = (s: Supplier) => {
    const phone = (s.phone || '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}`, '_blank');
  };

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Deuda a proveedores" value={money(totalPayable)} tone={totalPayable > 0 ? 'negative' : 'default'} />
        <Stat label="Con saldo pendiente" value={creditorCount} />
        <Stat label="Proveedores" value={suppliers.length} />
        <Card className="p-0">
          <button
            onClick={() => setEditing({ name: '', phone: '', notes: '', balance: 0 })}
            className="flex h-full w-full items-center justify-center gap-2 rounded-xl p-4 text-sm font-medium text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo proveedor
          </button>
        </Card>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proveedor…" className="h-10 pl-9" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-line">
          <SectionTitle icon={Truck}>Cuentas con proveedores ({filtered.length})</SectionTitle>
        </div>
        {filtered.length === 0 ? (
          <Empty icon={Truck} title="Sin proveedores" hint="Creá uno para registrar compras en cuenta." />
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2.5 px-4 py-3 hover:bg-surface-2/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h4 className="text-sm font-medium">{s.name}</h4>
                  <p className="text-xs text-muted">
                    {s.phone || 'sin teléfono'}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.balance > 0 ? 'red' : 'green'}>
                    {s.balance > 0
                      ? `Debés ${money(s.balance)}`
                      : s.balance < 0
                      ? `A favor ${money(-s.balance)}`
                      : 'Al día'}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {s.balance > 0 && (
                      <Button size="sm" variant="primary" onClick={() => setPaying(s)}>
                        Pagar
                      </Button>
                    )}
                    {s.phone && (
                      <IconButton variant="ghost" onClick={() => message(s)} title="WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </IconButton>
                    )}
                    <IconButton variant="ghost" onClick={() => setHistoryOf(s)} title="Historial de pagos">
                      <History className="h-4 w-4" />
                    </IconButton>
                    <IconButton variant="ghost" onClick={() => setEditing({ ...s })} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      className="hover:text-danger"
                      onClick={async () => {
                        if (s.balance !== 0) {
                          onToast({ message: 'No se puede borrar un proveedor con saldo', type: 'warning' });
                          return;
                        }
                        if (confirm(`¿Eliminar a ${s.name}?`)) {
                          await db.deleteSupplier(s.id);
                          await onRefresh();
                        }
                      }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <SupplierForm supplier={editing} onClose={() => setEditing(null)} onSave={save} />}

      {paying && (
        <SupplierPaymentModal
          supplier={paying}
          cashSession={cashSession}
          onClose={() => setPaying(null)}
          onDone={async () => {
            setPaying(null);
            await onRefresh();
            onToast({ message: 'Pago registrado', type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}

      {historyOf && <SupplierHistoryModal supplier={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
};

const SupplierForm: React.FC<{
  supplier: Partial<Supplier>;
  onClose: () => void;
  onSave: (s: Partial<Supplier>) => void;
}> = ({ supplier, onClose, onSave }) => {
  const [form, setForm] = useState(supplier);
  return (
    <Modal
      title={supplier.id ? 'Editar proveedor' : 'Nuevo proveedor'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => onSave(form)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Nombre</Label>
          <Input
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Distribuidora Norte"
          />
        </div>
        <div>
          <Label>Teléfono</Label>
          <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="549341…" />
        </div>
        <div>
          <Label>Nota</Label>
          <Input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {!supplier.id && (
          <div>
            <Label>Saldo inicial que le debés</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <Input
                type="number"
                value={form.balance ?? 0}
                onChange={(e) => setForm({ ...form, balance: parseFloat(e.target.value) || 0 })}
                className="pl-7 nums"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

const SupplierPaymentModal: React.FC<{
  supplier: Supplier;
  cashSession: CashSession | null;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}> = ({ supplier, cashSession, onClose, onDone, onError }) => {
  const [amount, setAmount] = useState(String(Math.round(supplier.balance)));
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const value = parseFloat(amount) || 0;

  const save = async () => {
    if (value <= 0) return;
    try {
      setSaving(true);
      await db.registerSupplierPayment(
        supplier.id,
        value,
        method,
        notes,
        method === 'efectivo' ? cashSession?.id ?? null : null,
      );
      await onDone();
    } catch (err: any) {
      onError(err.message || 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      size="sm"
      title={`Pagar a ${supplier.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || value <= 0}>
            {saving ? 'Guardando…' : 'Registrar pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-muted nums">
          Le debés: <span className="font-semibold text-danger">{money(supplier.balance)}</span>
        </p>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-7 nums" />
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
          <p className="text-xs text-warn">Caja cerrada: el pago no entra al arqueo.</p>
        )}
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota / N° de factura (opcional)" />
      </div>
    </Modal>
  );
};

const SupplierHistoryModal: React.FC<{ supplier: Supplier; onClose: () => void }> = ({ supplier, onClose }) => {
  const [payments, setPayments] = useState<SupplierPayment[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);

  React.useEffect(() => {
    db.fetchSupplierPayments(supplier.id).then(setPayments).catch(() => setPayments([]));
    db.fetchPurchases(100)
      .then((all) => setPurchases(all.filter((p) => p.supplierId === supplier.id)))
      .catch(() => setPurchases([]));
  }, [supplier.id]);

  return (
    <Modal title={supplier.name} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Pagos</p>
          {!payments ? (
            <p className="text-[13px] text-muted">Cargando…</p>
          ) : payments.length === 0 ? (
            <p className="text-[13px] text-muted">Sin pagos.</p>
          ) : (
            <div className="divide-y divide-line">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-muted nums">
                    {dateTime(p.createdAt)} · {PAYMENT_LABELS[p.method as PaymentMethod] || p.method}
                  </span>
                  <span className="font-semibold nums text-brand">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Compras</p>
          {!purchases ? (
            <p className="text-[13px] text-muted">Cargando…</p>
          ) : purchases.length === 0 ? (
            <p className="text-[13px] text-muted">Sin compras registradas.</p>
          ) : (
            <div className="divide-y divide-line">
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-muted nums">
                    {dateTime(p.timestamp)} · {p.items.length} ítems
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold nums">{money(p.total)}</span>
                    {!p.paid && <Badge tone="amber">en cuenta</Badge>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
