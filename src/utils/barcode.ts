import JsBarcode from 'jsbarcode';
import type { Product } from '../types';
import { money } from './format';
import { getBusinessName } from './printTicket';

/** Dígito verificador EAN-13 sobre 12 dígitos. */
function ean13CheckDigit(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * Genera un código interno EAN-13 válido (prefijo 20–29, reservado para uso
 * interno del comercio). Determinístico a partir de un número de secuencia.
 */
export function generateInternalBarcode(seq: number): string {
  const body = ('20' + String(Math.abs(seq)).padStart(10, '0')).slice(0, 12);
  return body + ean13CheckDigit(body);
}

/** Elige el formato de JsBarcode según cómo luce el código. */
function formatFor(code: string): string {
  if (/^\d{13}$/.test(code)) return 'EAN13';
  if (/^\d{12}$/.test(code)) return 'UPC';
  if (/^\d{8}$/.test(code)) return 'EAN8';
  return 'CODE128';
}

/** Devuelve el SVG (string) del código de barras, o null si no se pudo generar. */
export function barcodeSvg(code: string): string | null {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const tryFormat = (format: string) => {
    JsBarcode(el, code, {
      format,
      width: 2,
      height: 46,
      fontSize: 12,
      margin: 4,
      displayValue: true,
    });
  };
  try {
    tryFormat(formatFor(code));
  } catch {
    try {
      tryFormat('CODE128');
    } catch {
      return null;
    }
  }
  return new XMLSerializer().serializeToString(el);
}

export interface LabelSpec {
  product: Product;
  qty: number;
}

/** Abre una ventana con una grilla de etiquetas lista para imprimir. */
export function printLabels(specs: LabelSpec[]): void {
  const business = getBusinessName();
  const cells: string[] = [];

  for (const { product, qty } of specs) {
    const svg = barcodeSvg(product.barcode);
    if (!svg) continue;
    for (let i = 0; i < qty; i++) {
      cells.push(`<div class="label">
        <div class="biz">${escapeHtml(business)}</div>
        <div class="name">${escapeHtml(product.name)}</div>
        <div class="bc">${svg}</div>
        <div class="price">${money(product.sellPrice)}${product.priceUnit === 'kg' ? ' /kg' : ''}</div>
      </div>`);
    }
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .label {
    border: 1px dashed #bbb; border-radius: 3px; padding: 3mm 2mm; text-align: center;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    height: 30mm; break-inside: avoid;
  }
  .biz { font-size: 7px; letter-spacing: .04em; color: #666; text-transform: uppercase; }
  .name { font-size: 10px; font-weight: 600; line-height: 1.15; max-height: 24px; overflow: hidden; }
  .bc svg { max-width: 100%; height: 40px; }
  .price { font-size: 13px; font-weight: 700; }
  @media print { .label { border-color: transparent; } }
</style></head><body>
  <div class="sheet">${cells.join('')}</div>
  <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 400); };</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
