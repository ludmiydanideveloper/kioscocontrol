import { describe, it, expect } from 'vitest';
import { money, number, marginPct } from './format';

describe('money', () => {
  it('redondea y agrega separador de miles', () => {
    expect(money(2800)).toBe('$2.800');
    expect(money(1234567.6)).toBe('$1.234.568');
    expect(money(0)).toBe('$0');
  });
  it('tolera null / undefined / NaN', () => {
    expect(money(null)).toBe('$0');
    expect(money(undefined)).toBe('$0');
    expect(money(NaN)).toBe('$0');
  });
});

describe('number', () => {
  it('formatea sin símbolo', () => {
    expect(number(1500)).toBe('1.500');
    expect(number(0)).toBe('0');
  });
});

describe('marginPct', () => {
  it('calcula el margen sobre el precio de venta', () => {
    expect(marginPct(500, 1000)).toBe(50);
    expect(marginPct(800, 1000)).toBe(20);
  });
  it('devuelve 0 si el precio de venta es 0', () => {
    expect(marginPct(500, 0)).toBe(0);
  });
});
