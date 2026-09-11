import type { DateRangePreset } from '../types';

export interface Range {
  from: Date;
  to: Date;
  label: string;
}

/** Interpreta 'YYYY-MM-DD' (de un <input type="date">) como fecha local, no UTC. */
function parseLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function resolveRange(
  preset: DateRangePreset,
  customFrom?: string,
  customTo?: string,
): Range {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now), label: 'Hoy' };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: 'Ayer' };
    }
    case 'week': {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      return { from: startOfDay(w), to: endOfDay(now), label: 'Últimos 7 días' };
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(m), to: endOfDay(now), label: 'Este mes' };
    }
    case 'custom': {
      const f = customFrom ? startOfDay(parseLocalDate(customFrom)) : startOfDay(now);
      const t = customTo ? endOfDay(parseLocalDate(customTo)) : endOfDay(now);
      return {
        from: f,
        to: t,
        label: `${f.toLocaleDateString('es-AR')} — ${t.toLocaleDateString('es-AR')}`,
      };
    }
  }
}
