import React, { useState, useEffect } from 'react';
import { Delete, Store, Building2, Mail } from 'lucide-react';
import {
  login,
  cashierEnabled,
  getTenantSlug,
  setTenantSlug,
  tenantSlugExists,
  getTenantName,
  ownerLogin,
  ownerSignUp,
  type Role,
} from '../utils/auth';
import { getBackendMode } from '../utils/db';
import { soundFX } from '../utils/audio';
import { cx, Input, Button } from './ui';

type Mode = 'pin' | 'switch' | 'owner-login' | 'signup';

export const LockScreen: React.FC<{ onUnlock: (role: Role) => void }> = ({ onUnlock }) => {
  const [mode, setMode] = useState<Mode>('pin');

  // ---- PIN pad ----
  // Calculado al renderizar (no al importar el módulo): para cuando esta
  // pantalla se muestra, App ya esperó a que initBackend() elija el modo real.
  const [minPinLen] = useState(() => (getBackendMode() === 'supabase' ? 6 : 4));
  const [isMultiTenant] = useState(() => getBackendMode() === 'supabase');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hasCashier, setHasCashier] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);

  const refreshTenantInfo = () => {
    cashierEnabled().then(setHasCashier);
    if (isMultiTenant) getTenantName().then(setTenantName);
  };
  useEffect(refreshTenantInfo, []);

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

  // ---- Cambiar de negocio ----
  const [slugInput, setSlugInput] = useState(getTenantSlug() || '');
  const [slugError, setSlugError] = useState('');

  const confirmSwitch = async () => {
    setSlugError('');
    const ok = await tenantSlugExists(slugInput);
    if (!ok) {
      setSlugError('No encontramos ese kiosco.');
      return;
    }
    setTenantSlug(slugInput);
    setPin('');
    setError(false);
    setMode('pin');
    refreshTenantInfo();
  };

  // ---- Login del dueño con email ----
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState('');

  const doOwnerLogin = async () => {
    setOwnerError('');
    if (!ownerEmail || !ownerPassword) {
      setOwnerError('Completá email y contraseña.');
      return;
    }
    setOwnerBusy(true);
    try {
      const role = await ownerLogin(ownerEmail, ownerPassword);
      if (role) {
        soundFX.playBarcodeBeep();
        onUnlock(role);
      } else {
        setOwnerError('Email o contraseña incorrectos.');
      }
    } catch (err: any) {
      setOwnerError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setOwnerBusy(false);
    }
  };

  // ---- Activar el kiosco que ya te dieron de alta ----
  const [signupSlug, setSignupSlug] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState('');

  const doSignup = async () => {
    setSignupError('');
    if (!signupSlug.trim()) return setSignupError('Poné el código que te dieron.');
    if (!signupEmail || !signupPassword) return setSignupError('Completá tu email y una contraseña.');
    if (signupPassword.length < 6) return setSignupError('La contraseña debe tener al menos 6 caracteres.');
    setSignupBusy(true);
    try {
      await ownerSignUp(signupEmail, signupPassword, signupSlug.trim());
      soundFX.playBarcodeBeep();
      onUnlock('admin');
    } catch (err: any) {
      setSignupError(err.message || 'No se pudo activar el kiosco.');
    } finally {
      setSignupBusy(false);
    }
  };

  const shell = (icon: React.ReactNode, title: string, subtitle: string, children: React.ReactNode) => (
    <div className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="h-12 w-12 rounded-xl bg-ink text-white flex items-center justify-center mb-4 shrink-0">
        {icon}
      </div>
      <h1 className="text-lg font-semibold tracking-tight mb-1 text-center">{title}</h1>
      <p className="mb-5 text-[13px] text-muted text-center max-w-[280px]">{subtitle}</p>
      <div className="w-full max-w-[280px] space-y-3 py-2">{children}</div>
    </div>
  );

  if (mode === 'switch') {
    return shell(
      <Building2 className="h-6 w-6" strokeWidth={2} />,
      'Elegí tu kiosco',
      'Escribí el código que te dio el dueño del negocio. Dejalo vacío para el kiosco original de este equipo.',
      <>
        <Input
          autoFocus
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
          placeholder="código del kiosco (opcional)"
          onKeyDown={(e) => e.key === 'Enter' && confirmSwitch()}
        />
        {slugError && <p className="text-[13px] font-medium text-danger">{slugError}</p>}
        <Button variant="primary" className="w-full" onClick={confirmSwitch}>
          Continuar
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setMode('pin')}>
          Cancelar
        </Button>
      </>,
    );
  }

  if (mode === 'owner-login') {
    return shell(
      <Mail className="h-6 w-6" strokeWidth={2} />,
      'Iniciar sesión',
      'Con el email y la contraseña de tu cuenta de administrador.',
      <>
        <Input
          autoFocus
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder="tu@email.com"
        />
        <Input
          type="password"
          value={ownerPassword}
          onChange={(e) => setOwnerPassword(e.target.value)}
          placeholder="Contraseña"
          onKeyDown={(e) => e.key === 'Enter' && doOwnerLogin()}
        />
        {ownerError && <p className="text-[13px] font-medium text-danger">{ownerError}</p>}
        <Button variant="primary" className="w-full" onClick={doOwnerLogin} disabled={ownerBusy}>
          {ownerBusy ? 'Entrando…' : 'Entrar'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setMode('pin')}>
          Volver
        </Button>
      </>,
    );
  }

  if (mode === 'signup') {
    return shell(
      <Building2 className="h-6 w-6" strokeWidth={2} />,
      'Activá tu kiosco',
      'Usá el código que te dio quien te dio de alta, y elegí tu email y contraseña de administrador.',
      <>
        <Input
          autoFocus
          value={signupSlug}
          onChange={(e) => setSignupSlug(e.target.value)}
          placeholder="Código de tu kiosco"
        />
        <Input
          type="email"
          value={signupEmail}
          onChange={(e) => setSignupEmail(e.target.value)}
          placeholder="Tu email"
        />
        <Input
          type="password"
          value={signupPassword}
          onChange={(e) => setSignupPassword(e.target.value)}
          placeholder="Contraseña (6 o más)"
          onKeyDown={(e) => e.key === 'Enter' && doSignup()}
        />
        {signupError && <p className="text-[13px] font-medium text-danger">{signupError}</p>}
        <Button variant="primary" className="w-full" onClick={doSignup} disabled={signupBusy}>
          {signupBusy ? 'Activando…' : 'Activar mi kiosco'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setMode('pin')}>
          Volver
        </Button>
      </>,
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-canvas flex flex-col items-center justify-center p-6">
      <div className="h-12 w-12 rounded-xl bg-ink text-white flex items-center justify-center mb-4">
        <Store className="h-6 w-6" strokeWidth={2} />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{tenantName || 'Kiosco'}</h1>
      <p className="mt-1 mb-7 text-[13px] text-muted">
        {checking
          ? 'Verificando…'
          : hasCashier
          ? 'Ingresá tu PIN (admin o empleado)'
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

      {isMultiTenant && (
        <div className="mt-6 flex flex-col items-center gap-2 text-[12px] font-medium">
          <button
            onClick={() => {
              setOwnerError('');
              setMode('owner-login');
            }}
            className="text-muted hover:text-ink underline underline-offset-2"
          >
            ¿Sos dueño? Iniciá sesión con tu email
          </button>
          <button
            onClick={() => {
              setSignupError('');
              setMode('signup');
            }}
            className="text-muted hover:text-ink underline underline-offset-2"
          >
            ¿Te dieron un código? Activá tu kiosco
          </button>
          <button
            onClick={() => {
              setSlugInput(getTenantSlug() || '');
              setSlugError('');
              setMode('switch');
            }}
            className="text-muted hover:text-ink underline underline-offset-2"
          >
            ¿Es otro kiosco? Cambiar
          </button>
        </div>
      )}
    </div>
  );
};
