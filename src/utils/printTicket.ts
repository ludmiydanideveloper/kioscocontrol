import type { Sale } from '../types';
import { PAYMENT_LABELS } from '../types';
import { money, dateTime } from './format';

const BUSINESS_KEY = 'kioscocontrol:businessName';

export const getBusinessName = (): string => {
  try {
    return localStorage.getItem(BUSINESS_KEY) || 'KioscoControl';
  } catch {
    return 'KioscoControl';
  }
};

export const setBusinessName = (name: string): void => {
  try {
    localStorage.setItem(BUSINESS_KEY, name);
  } catch {
    /* noop */
  }
};

/** Abre una ventana con el ticket formateado para impresora térmica de 58mm. */
export function printTicket(sale: Sale): void {
  const business = getBusinessName();
  const rows = sale.items
    .map(
      (i) => `<tr>
        <td class="q">${i.quantity}x</td>
        <td class="n">${escapeHtml(i.name)}</td>
        <td class="p">${money(i.subtotal)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${sale.id}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 58mm; margin: 0; padding: 4mm 3mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2px; text-transform: uppercase; }
  .sub { text-align: center; font-size: 10px; margin-bottom: 6px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.q { width: 22px; }
  td.p { text-align: right; white-space: nowrap; }
  .tot { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 4px; }
  .line { display: flex; justify-content: space-between; font-size: 10px; }
  .foot { text-align: center; margin-top: 8px; font-size: 10px; }
</style></head><body>
  <h1>${escapeHtml(business)}</h1>
  <div class="sub">${dateTime(sale.timestamp)}<br>Ticket ${escapeHtml(sale.id)}</div>
  <hr>
  <table>${rows}</table>
  <hr>
  ${sale.discount > 0 ? `<div class="line"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div><div class="line"><span>Descuento</span><span>-${money(sale.discount)}</span></div>` : ''}
  <div class="tot"><span>TOTAL</span><span>${money(sale.total)}</span></div>
  <div class="line"><span>Pago</span><span>${PAYMENT_LABELS[sale.paymentMethod]}</span></div>
  ${sale.amountPaid ? `<div class="line"><span>Paga con</span><span>${money(sale.amountPaid)}</span></div>` : ''}
  ${sale.changeGiven ? `<div class="line"><span>Vuelto</span><span>${money(sale.changeGiven)}</span></div>` : ''}
  ${sale.customerName ? `<div class="line"><span>Cliente</span><span>${escapeHtml(sale.customerName)}</span></div>` : ''}
  <div class="foot">¡Gracias por su compra!</div>
  <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 300); };</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=320,height=600');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
