// ============================================================================
// Acceso con dos roles: administrador y vendedor.
//   - Modo local: PIN hasheado en localStorage — disuade el acceso casual,
//     no hay servidor que lo controle (no hay servidor, punto). Sirve para
//     un solo kiosco por dispositivo.
//   - Modo Supabase: login real contra Supabase Auth, multi-tenant — un solo
//     proyecto de Supabase puede alojar varios kioscos (negocios) distintos,
//     cada uno con sus propios datos aislados. Cada negocio tiene dos cuentas
//     fijas: admin@<slug>.kioscocontrol.local y vendedor@<slug>.kioscocontrol.local
//     (el kiosco original de este proyecto, antes de existir multi-tenant,
//     sigue sin subdominio: admin@kioscocontrol.local / vendedor@...). El PIN
//     es la contraseña de esa cuenta. `profiles` guarda el rol y el tenant de
//     cada una. Es control de acceso de verdad: las políticas RLS de
//     schema.sql exigen sesión + mismo tenant para cualquier operación, y las
//     tablas sensibles (proveedores, gastos, compras) sólo las puede tocar
//     quien tenga rol admin de ESE negocio — aunque alguien llame a la API
//     directo con la anon key, sin pasar por la app.
// ============================================================================
import { supabase } from './supabase';
import { getBackendMode } from './db';
import type { Employee, EmployeePermissions } from '../types';

export type Role = 'admin' | 'cashier';

const EMAIL_DOMAIN = 'kioscocontrol.local';
const SLUG_KEY = 'kioscocontrol:tenantSlug';

/** Slug del negocio activo en este dispositivo (null = el kiosco original, sin subdominio). */
export function getTenantSlug(): string | null {
  try {
    return localStorage.getItem(SLUG_KEY) || null;
  } catch {
    return null;
  }
}

/** Cambia a qué negocio apunta este dispositivo (lo usan empleados de otro kiosco que comparten un equipo). */
export function setTenantSlug(slug: string | null): void {
  try {
    const clean = slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || '';
    if (clean) localStorage.setItem(SLUG_KEY, clean);
    else localStorage.removeItem(SLUG_KEY);
  } catch {
    /* noop */
  }
}

function adminEmail(): string {
  const slug = getTenantSlug();
  return slug ? `admin@${slug}.${EMAIL_DOMAIN}` : `admin@${EMAIL_DOMAIN}`;
}
function cashierEmail(): string {
  const slug = getTenantSlug();
  return slug ? `vendedor@${slug}.${EMAIL_DOMAIN}` : `vendedor@${EMAIL_DOMAIN}`;
}

// ---------------------------------------------------------------------------
// Modo local — PIN en localStorage (un solo negocio por dispositivo, sin tenants)
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
// Modo Supabase — Supabase Auth real + tabla `profiles`, multi-tenant
// ---------------------------------------------------------------------------
interface ProfileRow {
  role: Role;
  active: boolean;
  name: string | null;
  permissions: EmployeePermissions;
}
async function getProfile(uid: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role,active,name,permissions')
    .eq('id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, permissions: data.permissions || {} } as ProfileRow;
}

/** Estado del tenant activo en este dispositivo (según getTenantSlug()). */
async function getTenantMeta(): Promise<{
  adminConfigured: boolean;
  cashierActive: boolean;
  name: string | null;
  exists: boolean;
}> {
  const slug = getTenantSlug();
  const q = slug
    ? supabase.from('tenants').select('admin_configured,cashier_active,name,active').eq('slug', slug)
    : supabase.from('tenants').select('admin_configured,cashier_active,name,active').eq('id', 'default');
  const { data } = await q.maybeSingle();
  return {
    adminConfigured: !!data?.admin_configured,
    cashierActive: !!data?.cashier_active,
    name: data?.name ?? null,
    exists: !!data && data.active !== false,
  };
}

/** Nombre del negocio activo (para mostrarlo al elegir/confirmar un kiosco). */
export async function getTenantName(): Promise<string | null> {
  if (getBackendMode() !== 'supabase') return null;
  return (await getTenantMeta()).name;
}

/** ¿Existe un kiosco con ese slug? (para validar antes de cambiarse a él). */
export async function tenantSlugExists(slug: string): Promise<boolean> {
  const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!clean) return true; // '' = el kiosco original, siempre existe
  const { data } = await supabase.from('tenants').select('id').eq('slug', clean).eq('active', true).maybeSingle();
  return !!data;
}

const supaAuth = {
  async authRequired(): Promise<boolean> {
    return (await getTenantMeta()).adminConfigured;
  },
  async cashierEnabled(): Promise<boolean> {
    return (await getTenantMeta()).cashierActive;
  },

  /** Alta inicial del administrador (primera vez que se configura el kiosco). */
  async setupAdmin(pin: string): Promise<void> {
    if (pin.length < 6) throw new Error('En la base central el PIN debe tener al menos 6 dígitos');
    const email = adminEmail();
    const { data, error } = await supabase.auth.signUp({ email, password: pin });
    if (error) {
      if (!/already/i.test(error.message)) throw new Error(error.message);

      // El email ya existe. Dos casos posibles:
      //  a) Cambio de PIN de un admin ya configurado (saveAdmin en Settings ya
      //     verificó el PIN actual antes de llegar acá, así que hay sesión).
      const { data: cur } = await supabase.auth.getSession();
      const curProf = cur.session ? await getProfile(cur.session.user.id) : null;
      if (curProf?.role === 'admin') {
        await supaAuth.changeOwnPin(pin);
        return;
      }
      //  b) Quedó una cuenta "fantasma" de un intento anterior que nunca llegó
      //     a reclamar el rol (p.ej. se activó antes de desactivar "Confirm
      //     email"). Si el PIN que acaban de escribir es el mismo de ese
      //     intento, iniciamos sesión con él y completamos el alta solos.
      if (!(await getTenantMeta()).adminConfigured) {
        const { data: retry, error: e2 } = await supabase.auth.signInWithPassword({ email, password: pin });
        if (!e2 && retry.session) {
          const { error: e3 } = await supabase.rpc('claim_role');
          if (e3) throw new Error(e3.message);
          return;
        }
        throw new Error(
          `Quedó un intento anterior sin terminar y no es el mismo PIN. Andá a Supabase → ` +
            `Authentication → Users, borrá "${email}" y volvé a activar el PIN.`,
        );
      }
      throw new Error('Ya existe un administrador configurado.');
    }
    if (!data.session) {
      throw new Error(
        'Quedó pendiente de confirmación. Desactivá "Confirm email" en Supabase → Authentication → Providers → Email y volvé a intentar.',
      );
    }
    const { error: e2 } = await supabase.rpc('claim_role');
    if (e2) throw new Error(e2.message);
  },

  async verifyAdmin(pin: string): Promise<boolean> {
    const { data, error } = await supabase.auth.signInWithPassword({ email: adminEmail(), password: pin });
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

    const adminEm = adminEmail();
    const { data, error } = await supabase.auth.signUp({ email: cashierEmail(), password: pin });
    if (error) {
      if (!/already/i.test(error.message)) {
        await supabase.auth.signInWithPassword({ email: adminEm, password: adminCurrentPin }).catch(() => {});
        throw new Error(error.message);
      }
      // El email ya existe. Si nunca se completó el alta (quedó "fantasma" de
      // un intento anterior con el mismo PIN), la reclamamos ahora.
      if (!(await getTenantMeta()).cashierActive) {
        const { data: retry, error: e2 } = await supabase.auth.signInWithPassword({
          email: cashierEmail(),
          password: pin,
        });
        if (!e2 && retry.session) {
          const { error: e3 } = await supabase.rpc('claim_role');
          await supabase.auth.signInWithPassword({ email: adminEm, password: adminCurrentPin }).catch(() => {});
          if (e3) throw new Error(e3.message);
          return;
        }
      }
      await supabase.auth.signInWithPassword({ email: adminEm, password: adminCurrentPin }).catch(() => {});
      throw new Error(
        'Ya existe una cuenta de vendedor con otro PIN. Para cambiarle el PIN, iniciá sesión como vendedor y usá "Cambiar mi PIN"; para desactivarla, usá el botón de abajo.',
      );
    }
    try {
      if (data.session) {
        const { error: e2 } = await supabase.rpc('claim_role');
        if (e2) throw new Error(e2.message);
      }
    } finally {
      const { error: e3 } = await supabase.auth.signInWithPassword({ email: adminEm, password: adminCurrentPin });
      if (e3) throw new Error('Vendedor creado, pero no se pudo restaurar la sesión de administrador: ' + e3.message);
    }
  },

  async setCashierActive(active: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_cashier_active', { p_active: active });
    if (error) throw new Error(error.message);
  },

  /** ¿Ya existe la cuenta de vendedor de este kiosco (esté activa o no)? El
   *  email es fijo, así que sólo se puede crear una vez; si existe pero está
   *  desactivada, se reactiva con setCashierActive en vez de crearla de nuevo. */
  async cashierAccountExists(): Promise<boolean> {
    // profiles sólo deja ver filas propias o (si sos admin) las de tu tenant,
    // así que este count ya viene naturalmente acotado al kiosco activo.
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'cashier');
    return (count || 0) > 0;
  },

  async login(pin: string): Promise<Role | null> {
    let { data, error } = await supabase.auth.signInWithPassword({ email: adminEmail(), password: pin });
    if (!error && data.session) {
      const prof = await getProfile(data.user!.id);
      if (prof?.role === 'admin' && prof.active) return 'admin';
      await supabase.auth.signOut();
    }
    // Empleados: probamos el PIN contra cada cuenta activa de este kiosco
    // (incluye la vieja "vendedor@..." si existe — es una fila de profiles más).
    const tenantId = getTenantSlug() || 'default';
    const { data: candidates } = await supabase.rpc('list_login_emails', { p_tenant_id: tenantId });
    for (const row of (candidates as { email: string }[] | null) || []) {
      ({ data, error } = await supabase.auth.signInWithPassword({ email: row.email, password: pin }));
      if (!error && data.session) {
        const prof = await getProfile(data.user!.id);
        if (prof?.role === 'cashier' && prof.active) return 'cashier';
        await supabase.auth.signOut();
      }
    }
    return null;
  },

  async currentRole(): Promise<Role | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Antes de que exista un administrador, la app queda abierta (igual que
      // en modo local) para que alguien pueda entrar a Configuración y crearlo.
      return (await supaAuth.authRequired()) ? null : 'admin';
    }
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
// Alta de kiosco por email real + panel de empleados (sólo modo Supabase).
// ---------------------------------------------------------------------------

/** Registra al dueño con SU email real y crea su negocio. */
export async function ownerSignUp(
  email: string,
  password: string,
  slug: string,
  businessName: string,
): Promise<void> {
  if (getBackendMode() !== 'supabase') throw new Error('No disponible en modo local');
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) {
    throw new Error('Revisá tu email para confirmar la cuenta antes de continuar.');
  }
  const { error: e2 } = await supabase.rpc('create_tenant', { p_slug: slug, p_name: businessName });
  if (e2) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error(e2.message);
  }
  setTenantSlug(slug);
}

/** Login del dueño con su email y contraseña reales. */
export async function ownerLogin(email: string, password: string): Promise<Role | null> {
  if (getBackendMode() !== 'supabase') throw new Error('No disponible en modo local');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  const prof = await getProfile(data.user!.id);
  if (!prof || !prof.active) {
    await supabase.auth.signOut();
    return null;
  }
  return prof.role;
}

/**
 * Da de alta un empleado nuevo (nombre + PIN). Por dentro crea una cuenta
 * real de Supabase Auth con un email al azar que el empleado nunca ve; eso
 * cambia la sesión activa al empleado nuevo, así que hace falta la
 * contraseña/PIN ACTUAL del admin para volver a entrar como admin al terminar.
 */
export async function createEmployee(name: string, pin: string, adminCurrentPassword: string): Promise<void> {
  if (getBackendMode() !== 'supabase') throw new Error('No disponible en modo local');
  if (pin.length < 6) throw new Error('El PIN debe tener al menos 6 dígitos');
  if (!adminCurrentPassword) throw new Error('Falta confirmar con tu contraseña/PIN actual');
  const { data: cur } = await supabase.auth.getSession();
  const adminEm = cur.session?.user.email;
  if (!adminEm) throw new Error('Iniciá sesión como administrador primero');

  const slug = getTenantSlug();
  const local = 'emp' + Math.random().toString(36).slice(2, 10);
  const empEmail = slug ? `${local}@${slug}.${EMAIL_DOMAIN}` : `${local}@${EMAIL_DOMAIN}`;

  const { data, error } = await supabase.auth.signUp({ email: empEmail, password: pin });
  if (error) {
    await supabase.auth.signInWithPassword({ email: adminEm, password: adminCurrentPassword }).catch(() => {});
    throw new Error(error.message);
  }
  try {
    if (!data.session) {
      throw new Error(
        'No se pudo crear la cuenta. Revisá que "Confirm email" esté desactivado en Supabase → Authentication → Providers → Email.',
      );
    }
    const { error: e2 } = await supabase.rpc('claim_employee', { p_name: name });
    if (e2) throw new Error(e2.message);
  } finally {
    const { error: e3 } = await supabase.auth.signInWithPassword({ email: adminEm, password: adminCurrentPassword });
    if (e3) throw new Error('Empleado creado, pero no se pudo restaurar tu sesión: ' + e3.message);
  }
}

/** Lista los empleados del negocio activo (RLS los acota solo, sin filtro explícito). */
export async function listEmployees(): Promise<Employee[]> {
  if (getBackendMode() !== 'supabase') return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,name,active,permissions')
    .eq('role', 'cashier')
    .order('createdAt', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({ ...r, permissions: r.permissions || {} })) as Employee[];
}

/** Edita nombre/permisos/activo de un empleado del negocio propio. */
export async function updateEmployee(
  id: string,
  name: string,
  permissions: EmployeePermissions,
  active: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_employee_permissions', {
    p_employee_id: id,
    p_name: name,
    p_permissions: permissions,
    p_active: active,
  });
  if (error) throw new Error(error.message);
}

/** Permisos del usuario logueado (para que la interfaz sepa qué pestañas mostrarle). */
export async function getMyPermissions(): Promise<EmployeePermissions> {
  if (getBackendMode() !== 'supabase') return {};
  const { data } = await supabase.auth.getSession();
  if (!data.session) return {};
  const prof = await getProfile(data.session.user.id);
  return prof?.permissions || {};
}

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
