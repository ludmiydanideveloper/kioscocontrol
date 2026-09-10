// Helpers de formato para toda la app (es-AR).

export const money = (n: number | null | undefined): string =>
  '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

export const number = (n: number | null | undefined): string =>
  (Number(n) || 0).toLocaleString('es-AR');

export const shortTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const longDate = (d: Date = new Date()): string =>
  d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Margen porcentual sobre precio de venta. */
export const marginPct = (cost: number, sell: number): number =>
  sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
