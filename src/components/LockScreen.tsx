import React, { useState, useEffect } from 'react';
import { Delete, Store } from 'lucide-react';
import { login, cashierEnabled, type Role } from '../utils/auth';
import { getBackendMode } from '../utils/db';
import { soundFX } from '../utils/audio';
import { cx } from './ui';

export const LockScreen: React.FC<{ onUnlock: (role: Role) => void }> = ({ onUnlock }) => {
  // Calculado al renderizar (no al importar el módulo): para cuando esta
  // pantalla se muestra, App ya esperó a que initBackend() elija el modo real.
  // En modo Supabase el PIN es la contraseña de una cuenta real (mínimo 6).
  const [minPinLen] = useState(() => (getBackendMode() === 'supabase' ? 6 : 4));
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hasCashier, setHasCashier] = useState(false);

  useEffect(() => {
    cashierEnabled().then(setHasCashier);
  }, []);

  const tryUnlock = async (value: string) => {
    setChecking(true);
    try {
      const role = await login(value);
      if (role) {
        soundFX.playBarcodeBeep();
        onUnlock(role);
      } else {
        soundFX.playErrorBuzz();
        setError(true);
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  const press = (digit: string) => {
    if (checking) return;
    setError(false);
    setPin((p) => {
      const next = (p + digit).slice(0, 8);
      if (next.length >= minPinLen) tryUnlock(next);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center p-6">
      <div className="h-12 w-12 rounded-xl bg-ink text-white flex items-center justify-center mb-4">
        <Store className="h-6 w-6" strokeWidth={2} />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Kiosco</h1>
      <p className="mt-1 mb-7 text-[13px] text-muted">
        {checking
          ? 'Verificando…'
          : hasCashier
          ? 'Ingresá tu PIN (admin o vendedor)'
          : 'Ingresá tu PIN para continuar'}
      </p>

      <div className="flex gap-2.5 mb-7 h-3">
        {Array.from({ length: Math.max(minPinLen, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={cx(
              'h-2.5 w-2.5 rounded-full transition-colors',
              i < pin.length ? 'bg-ink' : 'bg-line-strong',
              error && 'bg-danger',
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="aspect-square rounded-xl border border-line bg-surface text-lg font-medium nums card-shadow hover:bg-surface-2 active:bg-surface-2"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="aspect-square rounded-xl text-[13px] font-medium text-muted hover:text-ink"
        >
          Borrar
        </button>
        <button
          onClick={() => press('0')}
          className="aspect-square rounded-xl border border-line bg-surface text-lg font-medium nums card-shadow hover:bg-surface-2 active:bg-surface-2"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="aspect-square rounded-xl flex items-center justify-center text-muted hover:text-ink"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="mt-4 text-[13px] font-medium text-danger">PIN incorrecto</p>}
    </div>
  );
};
