import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  LockOpen,
  Lock,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
  Clock,
} from 'lucide-react';
import { CashSession, CashMovement } from '../types';
import { money, dateTime, shortTime } from '../utils/format';
import * as db from '../utils/db';

interface Props {
  cashSession: CashSession | null;
  onRefresh: () => Promise<void>;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

const MOVE_LABEL: Record<string, string> = {
  apertura: 'Apertura',
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  venta_efectivo: 'Venta efectivo',
  pago_fiado: 'Pago fiado',
};

export const CashRegister: React.FC<Props> = ({ cashSession, onRefresh, onToast }) => {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveModal, setMoveModal] = useState<'ingreso' | 'retiro' | null>(null);
  const [closeModal, setCloseModal] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const [hist, moves] = await Promise.all([
        db.fetchCashSessions(20),
        cashSession ? db.fetchCashMovements(cashSession.id) : Promise.resolve([]),
      ]);
      setHistory(hist);
      setMovements(moves);
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    }
  }, [cashSession, onToast]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const totals = movements.reduce(
    (acc, m) => {
      acc.all += m.amount;
      acc[m.type] = (acc[m.type] || 0) + m.amount;
      return acc;
    },
    { all: 0 } as Record<string, number>,
  );
  const expectedInDrawer = totals.all; // apertura ya está incluida como movimiento

  const openSession = async () => {
    const amount = parseFloat(openingAmount) || 0;
    try {
      setBusy(true);
      await db.openCashSession(amount, openNotes);
      setOpeningAmount('');
      setOpenNotes('');
      await onRefresh();
      onToast({ message: 'Caja abierta', type: 'success' });
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // ---- Sin caja abierta ----------------------------------------------------
  if (!cashSession) {
    return (
      <div className="space-y-4 pb-24 lg:pb-6">
        <div className="bg-white border-2 border-black p-6 max-w-md mx-auto shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 bg-black text-white flex items-center justify-center">
              <LockOpen className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest">Abrir caja</h3>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-1">Fondo inicial en efectivo ($)</label>
          <input
            type="number"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white border-2 border-black px-3 py-2 text-sm font-mono font-bold outline-none mb-3"
          />
          <input
            type="text"
            value={openNotes}
            onChange={(e) => setOpenNotes(e.target.value)}
            placeholder="Nota / responsable (opcional)"
            className="w-full bg-white border border-black px-3 py-1.5 text-xs outline-none mb-4"
          />
          <button
            onClick={openSession}
            disabled={busy}
            className="w-full py-3 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black disabled:opacity-50"
          >
            {busy ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>

        <SessionHistory history={history} />
      </div>
    );
  }

  // ---- Caja abierta ------------------------------------------------------
  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <div className="bg-white border-2 border-black p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-700 text-white flex items-center justify-center">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest">Caja abierta</h3>
            <p className="text-[11px] font-mono text-neutral-600 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Desde {dateTime(cashSession.openedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMoveModal('ingreso')}
            className="px-3 py-2 bg-[#F2F2EF] hover:bg-white text-black text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center gap-1.5"
          >
            <ArrowDownCircle className="w-4 h-4" /> Ingreso
          </button>
          <button
            onClick={() => setMoveModal('retiro')}
            className="px-3 py-2 bg-[#F2F2EF] hover:bg-white text-black text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center gap-1.5"
          >
            <ArrowUpCircle className="w-4 h-4" /> Retiro
          </button>
          <button
            onClick={() => setCloseModal(true)}
            className="px-3 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center gap-1.5"
          >
            <Lock className="w-4 h-4" /> Cerrar caja
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Fondo inicial" value={money(cashSession.openingAmount)} />
        <Stat label="Ventas en efectivo" value={money(totals.venta_efectivo || 0)} />
        <Stat label="Pagos de fiado" value={money(totals.pago_fiado || 0)} />
        <Stat
          label="Efectivo esperado en caja"
          value={money(expectedInDrawer)}
          highlight
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Ingresos manuales" value={money(totals.ingreso || 0)} />
        <Stat label="Retiros" value={money(totals.retiro || 0)} negative />
      </div>

      <div className="bg-white border-2 border-black overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-black bg-[#F2F2EF] text-xs font-bold uppercase tracking-wider">
          Movimientos de la caja ({movements.length})
        </div>
        <div className="divide-y divide-black/10 max-h-80 overflow-y-auto">
          {movements.map((m) => (
            <div key={m.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold">{MOVE_LABEL[m.type] || m.type}</span>
                <span className="block text-[11px] font-mono text-neutral-500">
                  {shortTime(m.createdAt)}
                  {m.reason ? ` · ${m.reason}` : ''}
                </span>
              </div>
              <span className={`font-mono font-bold ${m.amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {m.amount >= 0 ? '+' : ''}
                {money(m.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <SessionHistory history={history.filter((h) => h.id !== cashSession.id)} />

      {moveModal && (
        <MovementModal
          kind={moveModal}
          sessionId={cashSession.id}
          onClose={() => setMoveModal(null)}
          onDone={async () => {
            setMoveModal(null);
            await loadDetail();
            onToast({ message: 'Movimiento registrado', type: 'success' });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}

      {closeModal && (
        <CloseModal
          expected={expectedInDrawer}
          sessionId={cashSession.id}
          onClose={() => setCloseModal(false)}
          onDone={async (diff) => {
            setCloseModal(false);
            await onRefresh();
            await loadDetail();
            onToast({
              message:
                diff === 0
                  ? 'Caja cerrada — arqueo exacto'
                  : `Caja cerrada — diferencia de ${money(diff)}`,
              type: diff === 0 ? 'success' : 'warning',
            });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; highlight?: boolean; negative?: boolean }> = ({
  label,
  value,
  highlight,
  negative,
}) => (
  <div className={`border-2 border-black p-4 ${highlight ? 'bg-black text-white' : 'bg-white'}`}>
    <span
      className={`text-[10px] font-bold uppercase tracking-widest ${
        highlight ? 'text-white/60' : 'text-black/60'
      }`}
    >
      {label}
    </span>
    <p className={`text-xl sm:text-2xl font-black font-serif italic ${negative ? 'text-red-600' : ''}`}>{value}</p>
  </div>
);

const SessionHistory: React.FC<{ history: CashSession[] }> = ({ history }) => {
  const closed = history.filter((h) => h.status === 'closed');
  if (closed.length === 0) return null;
  return (
    <div className="bg-white border-2 border-black overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-black bg-[#F2F2EF] text-xs font-bold uppercase tracking-wider">
        Cierres anteriores
      </div>
      <div className="divide-y divide-black/10 max-h-72 overflow-y-auto">
        {closed.map((s) => (
          <div key={s.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
            <div>
              <span className="font-mono text-neutral-600">
                {dateTime(s.openedAt)} → {s.closedAt ? shortTime(s.closedAt) : '—'}
              </span>
              <span className="block text-[11px] text-neutral-500">
                Esperado {money(s.expectedAmount)} · Contado {money(s.closingCountedAmount)}
              </span>
            </div>
            <span
              className={`font-mono font-bold ${
                (s.difference || 0) === 0
                  ? 'text-emerald-700'
                  : (s.difference || 0) > 0
                  ? 'text-blue-700'
                  : 'text-red-600'
              }`}
            >
              {(s.difference || 0) >= 0 ? '+' : ''}
              {money(s.difference)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MovementModal: React.FC<{
  kind: 'ingreso' | 'retiro';
  sessionId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}> = ({ kind, sessionId, onClose, onDone, onError }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const value = parseFloat(amount) || 0;
    if (value <= 0) return;
    try {
      setBusy(true);
      await db.addCashMovement(sessionId, kind, value, reason);
      await onDone();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            {kind === 'ingreso' ? 'Ingreso de efectivo' : 'Retiro de efectivo'}
          </h3>
          <button onClick={onClose} className="font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto $"
            className="w-full bg-white border-2 border-black px-3 py-2 text-sm font-mono font-bold outline-none"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === 'retiro' ? 'Motivo (pago proveedor, etc.)' : 'Motivo'}
            className="w-full bg-white border border-black px-3 py-1.5 text-xs outline-none"
          />
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
            disabled={busy}
            className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black disabled:opacity-50"
          >
            {busy ? '...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CloseModal: React.FC<{
  expected: number;
  sessionId: string;
  onClose: () => void;
  onDone: (diff: number) => Promise<void>;
  onError: (m: string) => void;
}> = ({ expected, sessionId, onClose, onDone, onError }) => {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const countedValue = parseFloat(counted) || 0;
  const diff = countedValue - expected;

  const save = async () => {
    try {
      setBusy(true);
      const res = await db.closeCashSession(sessionId, countedValue, notes);
      await onDone(res.difference);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">Cerrar caja — Arqueo</h3>
          <button onClick={onClose} className="font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-neutral-600">Efectivo esperado</span>
            <span className="font-bold">{money(expected)}</span>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-1">Efectivo contado en caja ($)</label>
          <input
            type="number"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0"
            className="w-full bg-white border-2 border-black px-3 py-2 text-sm font-mono font-bold outline-none"
          />
          {counted !== '' && (
            <div
              className={`p-2 border-2 text-xs font-bold flex justify-between ${
                diff === 0
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : diff > 0
                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                  : 'border-red-600 bg-red-50 text-red-700'
              }`}
            >
              <span>{diff === 0 ? 'Arqueo exacto' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
              <span className="font-mono">
                {diff >= 0 ? '+' : ''}
                {money(diff)}
              </span>
            </div>
          )}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones del cierre (opcional)"
            className="w-full bg-white border border-black px-3 py-1.5 text-xs outline-none"
          />
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
            disabled={busy || counted === ''}
            className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black disabled:opacity-50"
          >
            {busy ? 'Cerrando...' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
};
