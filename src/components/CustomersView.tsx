import React, { useState, useMemo } from 'react';
import { Users, Plus, Search, Pencil, Trash2, MessageCircle, History } from 'lucide-react';
import { Customer, CustomerPayment, CashSession, PaymentMethod } from '../types';
import { PAYMENT_LABELS } from '../types';
import { money, dateTime } from '../utils/format';
import { Card, Button, IconButton, Input, Label, Badge, Stat, Modal, SectionTitle, Empty, cx } from './ui';
import * as db from '../utils/db';

interface Props {
  customers: Customer[];
  cashSession: CashSession | null;
  onRefresh: () => Promise<void>;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

export const CustomersView: React.FC<Props> = ({ customers, cashSession, onRefresh, onToast }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const filtered = useMemo(
    () =>
      [...customers]
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.balance - a.balance),
    [customers, search],
  );

  const totalReceivables = customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const debtorCount = customers.filter((c) => c.balance > 0).length;

  const saveCustomer = async (data: Partial<Customer>) => {
    if (!data.name?.trim()) {
      onToast({ message: 'El nombre es obligatorio', type: 'warning' });
      return;
    }
    try {
      await db.saveCustomer(data);
      setEditing(null);
      await onRefresh();
      onToast({ message: 'Cliente guardado', type: 'success' });
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    }
  };

  const remindWhatsApp = (c: Customer) => {
    const msg = `Hola ${c.name}, te recuerdo que tenés una cuenta pendiente en el kiosco por ${money(
      c.balance,
    )}. ¡Gracias!`;
    const phone = (c.phone || '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="A cobrar (fiado)" value={money(totalReceivables)} tone="negative" />
        <Stat label="Clientes con deuda" value={debtorCount} />
        <Stat label="Clientes totales" value={customers.length} />
        <Card className="p-0">
          <button
            onClick={() => setEditing({ name: '', phone: '', notes: '', balance: 0 })}
            className="flex h-full w-full items-center justify-center gap-2 rounded-xl p-4 text-sm font-medium text-ink-soft hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nuevo cliente
          </button>
        </Card>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="h-10 pl-9"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-line">
          <SectionTitle icon={Users}>Cuentas corrientes ({filtered.length})</SectionTitle>
        </div>
        {filtered.length === 0 ? (
          <Empty icon={Users} title="Sin clientes" hint="Creá uno para poder vender fiado." />
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-2.5 px-4 py-3 hover:bg-surface-2/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h4 className="text-sm font-medium">{c.name}</h4>
                  <p className="text-xs text-muted">
                    {c.phone || 'sin teléfono'}
                    {c.notes ? ` · ${c.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.balance > 0 ? 'red' : 'green'}>
                    {c.balance > 0
                      ? `Debe ${money(c.balance)}`
                      : c.balance < 0
                      ? `A favor ${money(-c.balance)}`
                      : 'Al día'}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {c.balance > 0 && (
                      <Button size="sm" variant="primary" onClick={() => setPayingCustomer(c)}>
                        Cobrar
                      </Button>
                    )}
                    {c.balance > 0 && c.phone && (
                      <IconButton variant="ghost" onClick={() => remindWhatsApp(c)} title="Recordar por WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </IconButton>
                    )}
                    <IconButton variant="ghost" onClick={() => setHistoryCustomer(c)} title="Historial de pagos">
                      <History className="h-4 w-4" />
                    </IconButton>
                    <IconButton variant="ghost" onClick={() => setEditing({ ...c })} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      className="hover:text-danger"
                      onClick={async () => {
                        if (c.balance !== 0) {
                          onToast({ message: 'No se puede borrar un cliente con saldo', type: 'warning' });
                          return;
                        }
                        if (confirm(`¿Eliminar a ${c.name}?`)) {
                          await db.deleteCustomer(c.id);
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

      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} onSave={saveCustomer} />}

      {payingCustomer && (
        <PaymentModal
          customer={payingCustomer}
          cashSession={cashSession}
          onClose={() => setPayingCustomer(null)}
          onDone={async () => {
            setPayingCustomer(null);
            await onRefresh();
            onToast({ message: 'Pago registrado', type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}

      {historyCustomer && (
        <PaymentHistoryModal customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />
      )}
    </div>
  );
};

const CustomerForm: React.FC<{
  customer: Partial<Customer>;
  onClose: () => void;
  onSave: (c: Partial<Customer>) => void;
}> = ({ customer, onClose, onSave }) => {
  const [form, setForm] = useState(customer);
  return (
    <Modal
      title={customer.id ? 'Editar cliente' : 'Nuevo cliente'}
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
            placeholder="Vecino Carlos / Laura Dpto 4"
          />
        </div>
        <div>
          <Label>Teléfono (WhatsApp)</Label>
          <Input
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="549341…"
          />
        </div>
        <div>
          <Label>Nota</Label>
          <Input value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {!customer.id && (
          <div>
            <Label>Saldo inicial que debe</Label>
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

const PaymentModal: React.FC<{
  customer: Customer;
  cashSession: CashSession | null;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}> = ({ customer, cashSession, onClose, onDone, onError }) => {
  const [amount, setAmount] = useState(String(Math.round(customer.balance)));
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const value = parseFloat(amount) || 0;

  const save = async () => {
    if (value <= 0) return;
    try {
      setSaving(true);
      await db.registerCustomerPayment(
        customer.id,
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
      title={`Cobrar a ${customer.name}`}
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
          Deuda actual: <span className="font-semibold text-danger">{money(customer.balance)}</span>
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
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota (opcional)" />
        {value > customer.balance && (
          <p className="text-xs text-muted nums">Queda a favor del cliente: {money(value - customer.balance)}</p>
        )}
      </div>
    </Modal>
  );
};

const PaymentHistoryModal: React.FC<{ customer: Customer; onClose: () => void }> = ({ customer, onClose }) => {
  const [payments, setPayments] = useState<CustomerPayment[] | null>(null);
  React.useEffect(() => {
    db.fetchCustomerPayments(customer.id).then(setPayments).catch(() => setPayments([]));
  }, [customer.id]);

  return (
    <Modal title={`Pagos de ${customer.name}`} onClose={onClose}>
      {!payments ? (
        <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>
      ) : payments.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">Sin pagos registrados.</p>
      ) : (
        <div className="divide-y divide-line -my-1">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2.5 text-[13px]">
              <div>
                <span className="text-muted nums">{dateTime(p.createdAt)}</span>
                <span className="block text-xs text-muted">
                  {PAYMENT_LABELS[p.method as PaymentMethod] || p.method}
                  {p.notes ? ` · ${p.notes}` : ''}
                </span>
              </div>
              <span className="font-semibold nums text-brand">{money(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
