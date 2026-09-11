import { describe, it, expect } from 'vitest';
import { generateInternalBarcode } from './barcode';

/** Verifica el dígito de control EAN-13 de un código de 13 dígitos. */
function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

describe('generateInternalBarcode', () => {
  it('genera un EAN-13 de 13 dígitos con prefijo interno 20', () => {
    const code = generateInternalBarcode(1);
    expect(code).toHaveLength(13);
    expect(code.startsWith('20')).toBe(true);
  });

  it('el dígito verificador es correcto', () => {
    for (const seq of [0, 1, 7, 42, 999, 123456]) {
      expect(ean13Valid(generateInternalBarcode(seq))).toBe(true);
    }
  });

  it('es determinístico y distinto por secuencia', () => {
    expect(generateInternalBarcode(5)).toBe(generateInternalBarcode(5));
    expect(generateInternalBarcode(5)).not.toBe(generateInternalBarcode(6));
  });
});
