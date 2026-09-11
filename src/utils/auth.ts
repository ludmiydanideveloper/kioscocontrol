// ============================================================================
// Acceso por PIN con dos roles: administrador y vendedor.
// Client-side (localStorage) — disuade el acceso casual, no es seguridad
// criptográfica. Guardamos sólo el hash del PIN, nunca el PIN.
//   - Sin PIN de administrador configurado → la app queda abierta (rol admin).
//   - El vendedor sólo ve el punto de venta.
// ============================================================================
export type Role = 'admin' | 'cashier';

const CFG_KEY = 'kioscocontrol:auth';
const SESSION_KEY = 'kioscocontrol:session';

interface AuthCfg {
  adminHash?: string;
  cashierHash?: string | null;
}

async function sha(pin: string): Promise<string> {
  const data = new TextEncoder().encode('kiosco::' + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCfg(): AuthCfg {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeCfg(cfg: AuthCfg) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* noop */
  }
}
function setSession(role: Role) {
  try {
    sessionStorage.setItem(SESSION_KEY, role);
  } catch {
    /* noop */
  }
}

/** ¿Hay un PIN de administrador configurado? (si no, la app está abierta) */
export const authRequired = (): boolean => !!readCfg().adminHash;

/** ¿Está habilitado el acceso de vendedor con su propio PIN? */
export const cashierEnabled = (): boolean => !!readCfg().cashierHash;

export async function setupAdmin(pin: string): Promise<void> {
  const cfg = readCfg();
  cfg.adminHash = await sha(pin);
  writeCfg(cfg);
}

export async function verifyAdmin(pin: string): Promise<boolean> {
  const cfg = readCfg();
  return !!cfg.adminHash && cfg.adminHash === (await sha(pin));
}

/** Desactiva todo el sistema de PIN (requiere el PIN de admin actual). */
export async function disableAuth(currentAdminPin: string): Promise<boolean> {
  if (!(await verifyAdmin(currentAdminPin))) return false;
  try {
    localStorage.removeItem(CFG_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
  return true;
}

export async function setCashierPin(pin: string | null): Promise<void> {
  const cfg = readCfg();
  cfg.cashierHash = pin ? await sha(pin) : null;
  writeCfg(cfg);
}

/** Valida un PIN y devuelve el rol al que corresponde (o null). */
export async function login(pin: string): Promise<Role | null> {
  const cfg = readCfg();
  const h = await sha(pin);
  if (cfg.adminHash && h === cfg.adminHash) {
    setSession('admin');
    return 'admin';
  }
  if (cfg.cashierHash && h === cfg.cashierHash) {
    setSession('cashier');
    return 'cashier';
  }
  return null;
}

export function currentRole(): Role | null {
  if (!authRequired()) return 'admin';
  try {
    const r = sessionStorage.getItem(SESSION_KEY);
    return r === 'admin' || r === 'cashier' ? r : null;
  } catch {
    return null;
  }
}

export const isAdmin = (): boolean => currentRole() === 'admin';

export function logout(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}
