import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  DollarSign,
  X,
  MessageCircle,
  History,
} from 'lucide-react';
import { Customer, CustomerPayment, CashSession, PaymentMethod } from '../types';
import { PAYMENT_LABELS } from '../types';
import { money, dateTime } from '../utils/format';
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
        <div className="bg-white border-2 border-black p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Total a cobrar (fiado)</span>
          <p className="text-2xl sm:text-3xl font-black font-serif italic text-red-700">{money(totalReceivables)}</p>
        </div>
        <div className="bg-white border-2 border-black p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Clientes con deuda</span>
          <p className="text-2xl sm:text-3xl font-black font-serif italic">{debtorCount}</p>
        </div>
        <div className="bg-white border-2 border-black p-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">Clientes totales</span>
          <p className="text-2xl sm:text-3xl font-black font-serif italic">{customers.length}</p>
        </div>
        <div className="bg-white border-2 border-black p-4 flex items-center justify-center">
          <button
            onClick={() => setEditing({ name: '', phone: '', notes: '', balance: 0 })}
            className="w-full h-full px-3 py-3 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo cliente
          </button>
        </div>
      </div>

      <div className="bg-white border-2 border-black p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full bg-white border-2 border-black pl-10 pr-4 py-2.5 text-sm outline-none focus:bg-[#FAF9F5]"
          />
        </div>
      </div>

      <div className="bg-white border-2 border-black overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between text-xs font-bold uppercase tracking-wider">
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Cuentas corrientes ({filtered.length})
          </span>
        </div>
        <div className="divide-y divide-black/10">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 font-serif italic text-xs">
              No hay clientes. Creá uno para vender fiado.
            </div>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="p-3.5 sm:px-4 sm:py-3 hover:bg-[#F9F9F7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-black">{c.name}</h4>
                  <p className="text-[11px] font-mono text-neutral-600">
                    {c.phone || 'sin teléfono'}
                    {c.notes ? ` · ${c.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span
                      className={`px-2.5 py-1 border-2 border-black text-xs font-bold font-mono ${
                        c.balance > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {c.balance > 0 ? `Debe ${money(c.balance)}` : c.balance < 0 ? `A favor ${money(-c.balance)}` : 'Al día'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.balance > 0 && (
                      <button
                        onClick={() => setPayingCustomer(c)}
                        className="px-2.5 py-1.5 bg-black hover:bg-neutral-800 text-white text-[11px] font-bold uppercase tracking-wider border border-black"
                      >
                        Cobrar
                      </button>
                    )}
                    {c.balance > 0 && c.phone && (
                      <button
                        onClick={() => remindWhatsApp(c)}
                        className="p-1.5 border border-black/30 hover:border-black text-emerald-700"
                        title="Recordar por WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setHistoryCustomer(c)}
                      className="p-1.5 border border-black/30 hover:border-black"
                      title="Historial de pagos"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditing({ ...c })}
                      className="p-1.5 border border-black/30 hover:border-black"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (c.balance !== 0) {
                          onToast({ message: 'No se puede borrar un cliente con saldo distinto de cero', type: 'warning' });
                          return;
                        }
                        if (confirm(`¿Eliminar a ${c.name}?`)) {
                          await db.deleteCustomer(c.id);
                          await onRefresh();
                        }
                      }}
                      className="p-1.5 border border-black/30 hover:border-red-600 text-neutral-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {editing && (
        <CustomerForm customer={editing} onClose={() => setEditing(null)} onSave={saveCustomer} />
      )}

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
  const field = 'w-full bg-white border-2 border-black px-3 py-2 text-sm outline-none focus:bg-[#FAF9F5]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            {customer.id ? 'Editar cliente' : 'Nuevo cliente'}
          </h3>
          <button onClick={onClose} className="font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Nombre *</label>
            <input
              type="text"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={field}
              placeholder="Vecino Carlos / Laura Dpto 4"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Teléfono (WhatsApp)</label>
            <input
              type="text"
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={field}
              placeholder="549341..."
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Nota</label>
            <input
              type="text"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={field}
            />
          </div>
          {!customer.id && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1">Saldo inicial que debe ($)</label>
              <input
                type="number"
                value={form.balance ?? 0}
                onChange={(e) => setForm({ ...form, balance: parseFloat(e.target.value) || 0 })}
                className={`${field} font-mono font-bold`}
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t-2 border-black flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-black text-xs font-bold uppercase tracking-wider hover:bg-[#F2F2EF]"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">Cobrar a {customer.name}</h3>
          <button onClick={onClose} className="font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs font-mono text-neutral-600">
            Deuda actual: <span className="font-bold text-red-700">{money(customer.balance)}</span>
          </p>
          <div className="relative">
            <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-white border-2 border-black pl-9 pr-3 py-2 text-sm font-mono font-bold outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['efectivo', 'transferencia', 'debito'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`p-2 border text-[10px] font-bold uppercase tracking-wider ${
                  method === m ? 'bg-black text-white border-black' : 'bg-[#F2F2EF] border-black'
                }`}
              >
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>
          {method === 'efectivo' && !cashSession && (
            <p className="text-[11px] font-serif italic text-amber-700">
              Caja cerrada: el pago no se sumará al arqueo.
            </p>
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota (opcional)"
            className="w-full bg-white border border-black px-3 py-1.5 text-xs outline-none"
          />
          {value > customer.balance && (
            <p className="text-[11px] font-mono text-neutral-600">
              Queda a favor del cliente: {money(value - customer.balance)}
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t-2 border-black flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-black text-xs font-bold uppercase tracking-wider hover:bg-[#F2F2EF]"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || value <= 0}
            className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PaymentHistoryModal: React.FC<{ customer: Customer; onClose: () => void }> = ({ customer, onClose }) => {
  const [payments, setPayments] = useState<CustomerPayment[] | null>(null);

  React.useEffect(() => {
    db.fetchCustomerPayments(customer.id).then(setPayments).catch(() => setPayments([]));
  }, [customer.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">Pagos de {customer.name}</h3>
          <button onClick={onClose} className="font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-black/10">
          {!payments ? (
            <p className="p-6 text-center text-xs font-serif italic text-neutral-500">Cargando...</p>
          ) : payments.length === 0 ? (
            <p className="p-6 text-center text-xs font-serif italic text-neutral-500">Sin pagos registrados.</p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-neutral-600">{dateTime(p.createdAt)}</span>
                  <span className="block text-[11px] text-neutral-500">
                    {PAYMENT_LABELS[p.method as PaymentMethod] || p.method}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </span>
                </div>
                <span className="font-mono font-bold text-emerald-700">{money(p.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
