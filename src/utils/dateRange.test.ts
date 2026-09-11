import { describe, it, expect } from 'vitest';
import { resolveRange } from './dateRange';

describe('resolveRange', () => {
  it('hoy: mismo día, de 00:00 a 23:59', () => {
    const r = resolveRange('today');
    expect(r.label).toBe('Hoy');
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getHours()).toBe(23);
    expect(r.from.toDateString()).toBe(new Date().toDateString());
  });

  it('ayer: día anterior completo', () => {
    const r = resolveRange('yesterday');
    const y = new Date();
    y.setDate(y.getDate() - 1);
    expect(r.from.toDateString()).toBe(y.toDateString());
    expect(r.to.toDateString()).toBe(y.toDateString());
  });

  it('semana: abarca 7 días', () => {
    const r = resolveRange('week');
    const days = (r.to.getTime() - r.from.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThan(7);
  });

  it('mes: arranca el día 1', () => {
    const r = resolveRange('month');
    expect(r.from.getDate()).toBe(1);
  });

  it('personalizado: usa las fechas dadas', () => {
    const r = resolveRange('custom', '2026-01-10', '2026-01-20');
    expect(r.from.getFullYear()).toBe(2026);
    expect(r.from.getDate()).toBe(10);
    expect(r.to.getDate()).toBe(20);
  });
});
