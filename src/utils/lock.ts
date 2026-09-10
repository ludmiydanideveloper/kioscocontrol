// PIN de acceso. Client-side (localStorage) — disuade el acceso casual, no es
// seguridad criptográfica. El hash evita guardar el PIN en texto plano.
const PIN_KEY = 'kioscocontrol:pinHash';
const SESSION_KEY = 'kioscocontrol:unlocked';

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('kiosco::' + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const isPinSet = (): boolean => {
  try {
    return !!localStorage.getItem(PIN_KEY);
  } catch {
    return false;
  }
};

export async function setPin(pin: string): Promise<void> {
  localStorage.setItem(PIN_KEY, await hashPin(pin));
}

export function clearPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    return localStorage.getItem(PIN_KEY) === (await hashPin(pin));
  } catch {
    return false;
  }
}

export const isUnlocked = (): boolean => {
  if (!isPinSet()) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

export const markUnlocked = (): void => {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* noop */
  }
};

export const lockNow = (): void => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
};
