import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, Lock, Clock } from 'lucide-react';
import { CashSession, CashMovement } from '../types';
import { money, dateTime, shortTime } from '../utils/format';
import { Card, Button, Input, Label, Stat, Modal, SectionTitle, cx } from './ui';
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
  pago_fiado: 'Pago de fiado',
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
  const expectedInDrawer = totals.all;

  const openSession = async () => {
    try {
      setBusy(true);
      await db.openCashSession(parseFloat(openingAmount) || 0, openNotes);
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

  if (!cashSession) {
    return (
      <div className="space-y-4 pb-24 lg:pb-6">
        <Card pad className="max-w-md mx-auto">
          <SectionTitle icon={Wallet}>Abrir caja</SectionTitle>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Fondo inicial en efectivo</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                <Input
                  type="number"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0"
                  className="pl-7 nums"
                />
              </div>
            </div>
            <Input
              value={openNotes}
              onChange={(e) => setOpenNotes(e.target.value)}
              placeholder="Nota / responsable (opcional)"
            />
            <Button variant="primary" size="lg" className="w-full" onClick={openSession} disabled={busy}>
              {busy ? 'Abriendo…' : 'Abrir caja'}
            </Button>
          </div>
        </Card>
        <SessionHistory history={history} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <Card pad className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Wallet className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Caja abierta</h3>
            <p className="flex items-center gap-1 text-xs text-muted nums">
              <Clock className="h-3 w-3" /> desde {dateTime(cashSession.openedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setMoveModal('ingreso')}>
            <ArrowDownLeft className="h-4 w-4" strokeWidth={2} /> Ingreso
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMoveModal('retiro')}>
            <ArrowUpRight className="h-4 w-4" strokeWidth={2} /> Retiro
          </Button>
          <Button size="sm" variant="primary" onClick={() => setCloseModal(true)}>
            <Lock className="h-4 w-4" strokeWidth={2} /> Cerrar
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Fondo inicial" value={money(cashSession.openingAmount)} />
        <Stat label="Ventas en efectivo" value={money(totals.venta_efectivo || 0)} tone="positive" />
        <Stat label="Pagos de fiado" value={money(totals.pago_fiado || 0)} tone="positive" />
        <Stat label="Efectivo esperado" value={money(expectedInDrawer)} icon={Wallet} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Ingresos manuales" value={money(totals.ingreso || 0)} />
        <Stat label="Retiros" value={money(totals.retiro || 0)} tone="negative" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-line">
          <SectionTitle>Movimientos ({movements.length})</SectionTitle>
        </div>
        <div className="divide-y divide-line max-h-80 overflow-y-auto">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <div>
                <span className="font-medium">{MOVE_LABEL[m.type] || m.type}</span>
                <span className="block text-xs text-muted nums">
                  {shortTime(m.createdAt)}
                  {m.reason ? ` · ${m.reason}` : ''}
                </span>
              </div>
              <span className={cx('font-semibold nums', m.amount >= 0 ? 'text-brand' : 'text-danger')}>
                {m.amount >= 0 ? '+' : ''}
                {money(m.amount)}
              </span>
            </div>
          ))}
        </div>
      </Card>

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
              message: diff === 0 ? 'Caja cerrada — arqueo exacto' : `Caja cerrada — diferencia ${money(diff)}`,
              type: diff === 0 ? 'success' : 'warning',
            });
          }}
          onError={(m) => onToast({ message: m, type: 'error' })}
        />
      )}
    </div>
  );
};

const SessionHistory: React.FC<{ history: CashSession[] }> = ({ history }) => {
  const closed = history.filter((h) => h.status === 'closed');
  if (closed.length === 0) return null;
  return (
    <Card className="overflow-hidden p-0">
      <div className="px-4 py-3 border-b border-line">
        <SectionTitle>Cierres anteriores</SectionTitle>
      </div>
      <div className="divide-y divide-line max-h-72 overflow-y-auto">
        {closed.map((s) => {
          const d = s.difference || 0;
          return (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <div>
                <span className="text-muted nums">
                  {dateTime(s.openedAt)} → {s.closedAt ? shortTime(s.closedAt) : '—'}
                </span>
                <span className="block text-xs text-muted nums">
                  esperado {money(s.expectedAmount)} · contado {money(s.closingCountedAmount)}
                </span>
              </div>
              <span
                className={cx(
                  'font-semibold nums',
                  d === 0 ? 'text-brand' : d > 0 ? 'text-info' : 'text-danger',
                )}
              >
                {d >= 0 ? '+' : ''}
                {money(d)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
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
    <Modal
      size="sm"
      title={kind === 'ingreso' ? 'Ingreso de efectivo' : 'Retiro de efectivo'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? '…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto"
            className="pl-7 nums"
          />
        </div>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={kind === 'retiro' ? 'Motivo (pago a proveedor, etc.)' : 'Motivo'}
        />
      </div>
    </Modal>
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
  const diff = (parseFloat(counted) || 0) - expected;

  const save = async () => {
    try {
      setBusy(true);
      const res = await db.closeCashSession(sessionId, parseFloat(counted) || 0, notes);
      await onDone(res.difference);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="sm"
      title="Cerrar caja · arqueo"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || counted === ''}>
            {busy ? 'Cerrando…' : 'Confirmar cierre'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex justify-between text-[13px] nums">
          <span className="text-muted">Efectivo esperado</span>
          <span className="font-semibold">{money(expected)}</span>
        </div>
        <div>
          <Label>Efectivo contado en caja</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <Input
              type="number"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0"
              className="pl-7 nums"
            />
          </div>
        </div>
        {counted !== '' && (
          <div
            className={cx(
              'flex justify-between rounded-lg border px-3 py-2 text-[13px] font-medium',
              diff === 0
                ? 'border-brand/25 bg-brand-soft text-brand'
                : diff > 0
                ? 'border-info/25 bg-[#eef3fb] text-info'
                : 'border-danger/25 bg-danger-soft text-danger',
            )}
          >
            <span>{diff === 0 ? 'Arqueo exacto' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
            <span className="nums">
              {diff >= 0 ? '+' : ''}
              {money(diff)}
            </span>
          </div>
        )}
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones (opcional)"
        />
      </div>
    </Modal>
  );
};
