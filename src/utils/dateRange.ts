import type { DateRangePreset } from '../types';

export interface Range {
  from: Date;
  to: Date;
  label: string;
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
      const f = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now);
      const t = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
      return {
        from: f,
        to: t,
        label: `${f.toLocaleDateString('es-AR')} — ${t.toLocaleDateString('es-AR')}`,
      };
    }
  }
}
