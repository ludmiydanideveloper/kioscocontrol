// ============================================================================
// Acceso con dos roles: administrador y vendedor.
//   - Modo local: PIN hasheado en localStorage — disuade el acceso casual,
//     no hay servidor que lo controle (no hay servidor, punto).
//   - Modo Supabase: login real contra Supabase Auth. Dos cuentas fijas por
//     kiosco (admin@kioscocontrol.local / vendedor@kioscocontrol.local), con
//     el PIN como contraseña, y una tabla `profiles` con el rol de cada una.
//     Es control de acceso de verdad: las políticas RLS de schema.sql exigen
//     sesión para cualquier operación, y las tablas sensibles (proveedores,
//     gastos, compras) sólo las puede tocar quien tenga rol admin — aunque
//     alguien llame a la API directo con la anon key, sin pasar por la app.
// ============================================================================
import { supabase } from './supabase';
import { getBackendMode } from './db';

export type Role = 'admin' | 'cashier';

const ADMIN_EMAIL = 'admin@kioscocontrol.local';
const CASHIER_EMAIL = 'vendedor@kioscocontrol.local';

// ---------------------------------------------------------------------------
// Modo local — PIN en localStorage
// ---------------------------------------------------------------------------
const CFG_KEY = 'kioscocontrol:auth';
const SESSION_KEY = 'kioscocontrol:session';

interface LocalAuthCfg {
  adminHash?: string;
  cashierHash?: string | null;
}

async function sha(pin: string): Promise<string> {
  const data = new TextEncoder().encode('kiosco::' + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function readCfg(): LocalAuthCfg {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeCfg(cfg: LocalAuthCfg) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* noop */
  }
}
function setLocalSession(role: Role) {
  try {
    sessionStorage.setItem(SESSION_KEY, role);
  } catch {
    /* noop */
  }
}

const localAuth = {
  async authRequired(): Promise<boolean> {
    return !!readCfg().adminHash;
  },
  async cashierEnabled(): Promise<boolean> {
    return !!readCfg().cashierHash;
  },
  async setupAdmin(pin: string): Promise<void> {
    const cfg = readCfg();
    cfg.adminHash = await sha(pin);
    writeCfg(cfg);
  },
  async verifyAdmin(pin: string): Promise<boolean> {
    const cfg = readCfg();
    return !!cfg.adminHash && cfg.adminHash === (await sha(pin));
  },
  async disableAuth(currentAdminPin: string): Promise<boolean> {
    if (!(await localAuth.verifyAdmin(currentAdminPin))) return false;
    try {
      localStorage.removeItem(CFG_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
    return true;
  },
  async setCashierPin(pin: string | null): Promise<void> {
    const cfg = readCfg();
    cfg.cashierHash = pin ? await sha(pin) : null;
    writeCfg(cfg);
  },
  async setCashierActive(active: boolean): Promise<void> {
    if (active) return; // en local no hay cuenta que "reactivar"; usar setCashierPin.
    await localAuth.setCashierPin(null);
  },
  async login(pin: string): Promise<Role | null> {
    const cfg = readCfg();
    const h = await sha(pin);
    if (cfg.adminHash && h === cfg.adminHash) {
      setLocalSession('admin');
      return 'admin';
    }
    if (cfg.cashierHash && h === cfg.cashierHash) {
      setLocalSession('cashier');
      return 'cashier';
    }
    return null;
  },
  async currentRole(): Promise<Role | null> {
    if (!(await localAuth.authRequired())) return 'admin';
    try {
      const r = sessionStorage.getItem(SESSION_KEY);
      return r === 'admin' || r === 'cashier' ? r : null;
    } catch {
      return null;
    }
  },
  async logout(): Promise<void> {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
  },
  async changeOwnPin(): Promise<void> {
    throw new Error('No disponible en modo local (no hay sesión propia que cambiar)');
  },
};

// ---------------------------------------------------------------------------
// Modo Supabase — Supabase Auth real + tabla `profiles`
// ---------------------------------------------------------------------------
async function getProfile(uid: string): Promise<{ role: Role; active: boolean } | null> {
  const { data, error } = await supabase.from('profiles').select('role,active').eq('id', uid).maybeSingle();
  if (error || !data) return null;
  return data as { role: Role; active: boolean };
}

async function getMeta(): Promise<{ adminConfigured: boolean; cashierActive: boolean }> {
  const { data } = await supabase
    .from('app_meta')
    .select('admin_configured,cashier_active')
    .eq('id', 'singleton')
    .maybeSingle();
  return { adminConfigured: !!data?.admin_configured, cashierActive: !!data?.cashier_active };
}

const supaAuth = {
  async authRequired(): Promise<boolean> {
    return (await getMeta()).adminConfigured;
  },
  async cashierEnabled(): Promise<boolean> {
    return (await getMeta()).cashierActive;
  },

  /** Alta inicial del administrador (primera vez que se configura el kiosco). */
  async setupAdmin(pin: string): Promise<void> {
    if (pin.length < 6) throw new Error('En la base central el PIN debe tener al menos 6 dígitos');
    const { data, error } = await supabase.auth.signUp({ email: ADMIN_EMAIL, password: pin });
    if (error) {
      // Ya existe la cuenta admin → esto es un cambio de PIN, no un alta.
      // (saveAdmin en Settings ya verificó el PIN actual antes de llegar acá,
      // así que hay una sesión de admin activa para poder cambiarla.)
      if (/already/i.test(error.message)) {
        const { data: cur } = await supabase.auth.getSession();
        const prof = cur.session ? await getProfile(cur.session.user.id) : null;
        if (prof?.role === 'admin') {
          await supaAuth.changeOwnPin(pin);
          return;
        }
        throw new Error('Ya existe un administrador configurado.');
      }
      throw new Error(error.message);
    }
    if (!data.session) {
      throw new Error(
        'Quedó pendiente de confirmación. Desactivá "Confirm email" en Supabase → Authentication → Providers → Email y volvé a intentar.',
      );
    }
    const { error: e2 } = await supabase.rpc('claim_role', { p_role: 'admin' });
    if (e2) throw new Error(e2.message);
  },

  async verifyAdmin(pin: string): Promise<boolean> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pin });
    if (error || !data.session) return false;
    const prof = await getProfile(data.user!.id);
    const ok = prof?.role === 'admin' && prof.active;
    if (!ok) await supabase.auth.signOut();
    return !!ok;
  },

  /** No hay forma de "borrar" la cuenta sin el panel de Supabase: sólo cierra la sesión. */
  async disableAuth(): Promise<boolean> {
    await supabase.auth.signOut();
    return true;
  },

  /**
   * Crea la cuenta de vendedor (única vez: el email es fijo). `adminCurrentPin`
   * es necesario porque dar de alta un usuario en Supabase Auth cambia la
   * sesión activa a ese usuario nuevo — lo usamos para volver a entrar como
   * admin apenas termina.
   */
  async setCashierPin(pin: string | null, adminCurrentPin?: string): Promise<void> {
    if (pin === null) {
      await supaAuth.setCashierActive(false);
      return;
    }
    if (pin.length < 6) throw new Error('El PIN debe tener al menos 6 dígitos');
    if (!adminCurrentPin) throw new Error('Falta confirmar con el PIN de administrador actual');

    const { data, error } = await supabase.auth.signUp({ email: CASHIER_EMAIL, password: pin });
    if (error) {
      await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: adminCurrentPin }).catch(() => {});
      if (/already/i.test(error.message)) {
        throw new Error(
          'Ya existe una cuenta de vendedor. Para cambiarle el PIN, iniciá sesión como vendedor y usá "Cambiar mi PIN"; para desactivarla, usá el botón de abajo.',
        );
      }
      throw new Error(error.message);
    }
    try {
      if (data.session) {
        const { error: e2 } = await supabase.rpc('claim_role', { p_role: 'cashier' });
        if (e2) throw new Error(e2.message);
      }
    } finally {
      const { error: e3 } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: adminCurrentPin });
      if (e3) throw new Error('Vendedor creado, pero no se pudo restaurar la sesión de administrador: ' + e3.message);
    }
  },

  async setCashierActive(active: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_cashier_active', { p_active: active });
    if (error) throw new Error(error.message);
  },

  /** ¿Ya existe la cuenta de vendedor (esté activa o no)? El email es fijo, así
   *  que sólo se puede crear una vez; si existe pero está desactivada, se
   *  reactiva con setCashierActive en vez de crearla de nuevo. */
  async cashierAccountExists(): Promise<boolean> {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'cashier');
    return (count || 0) > 0;
  },

  async login(pin: string): Promise<Role | null> {
    let { data, error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pin });
    if (!error && data.session) {
      const prof = await getProfile(data.user!.id);
      if (prof?.role === 'admin' && prof.active) return 'admin';
      await supabase.auth.signOut();
    }
    ({ data, error } = await supabase.auth.signInWithPassword({ email: CASHIER_EMAIL, password: pin }));
    if (!error && data.session) {
      const prof = await getProfile(data.user!.id);
      if (prof?.role === 'cashier' && prof.active) return 'cashier';
      await supabase.auth.signOut();
    }
    return null;
  },

  async currentRole(): Promise<Role | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const prof = await getProfile(data.session.user.id);
    if (!prof || !prof.active) return null;
    return prof.role;
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },

  /** Cambiar el propio PIN estando logueado (lo usa el vendedor sobre sí mismo). */
  async changeOwnPin(newPin: string): Promise<void> {
    if (newPin.length < 6) throw new Error('El PIN debe tener al menos 6 dígitos');
    const { error } = await supabase.auth.updateUser({ password: newPin });
    if (error) throw new Error(error.message);
  },
};

// ---------------------------------------------------------------------------
// Dispatch según backend activo
// ---------------------------------------------------------------------------
const impl = () => (getBackendMode() === 'supabase' ? supaAuth : localAuth);

export const authRequired = (): Promise<boolean> => impl().authRequired();
export const cashierEnabled = (): Promise<boolean> => impl().cashierEnabled();
export const setupAdmin = (pin: string): Promise<void> => impl().setupAdmin(pin);
export const verifyAdmin = (pin: string): Promise<boolean> => impl().verifyAdmin(pin);
export const disableAuth = (currentAdminPin: string): Promise<boolean> => impl().disableAuth(currentAdminPin);
export const setCashierPin = (pin: string | null, adminCurrentPin?: string): Promise<void> =>
  getBackendMode() === 'supabase'
    ? supaAuth.setCashierPin(pin, adminCurrentPin)
    : localAuth.setCashierPin(pin);
export const setCashierActive = (active: boolean): Promise<void> => impl().setCashierActive(active);
export const cashierAccountExists = (): Promise<boolean> =>
  getBackendMode() === 'supabase' ? supaAuth.cashierAccountExists() : localAuth.cashierEnabled();
export const login = (pin: string): Promise<Role | null> => impl().login(pin);
export const currentRole = (): Promise<Role | null> => impl().currentRole();
export const logout = (): Promise<void> => impl().logout();
export const changeOwnPin = (newPin: string): Promise<void> => impl().changeOwnPin(newPin);
export const isRealAuth = (): boolean => getBackendMode() === 'supabase';

export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === 'admin';
}
