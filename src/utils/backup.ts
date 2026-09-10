// Export / import de datos. El export funciona en los dos modos (lee vía el
// facade db). El import sólo escribe el store local.
import * as db from './db';

const LOCAL_KEY = 'kioscocontrol:v1';

export interface BackupFile {
  app: 'kioscocontrol';
  version: 1;
  exportedAt: string;
  mode: string;
  products: unknown[];
  sales: unknown[];
  customers: unknown[];
}

export async function exportData(): Promise<BackupFile> {
  const [products, sales, customers] = await Promise.all([
    db.fetchProducts(),
    db.fetchSales(),
    db.fetchCustomers(),
  ]);
  return {
    app: 'kioscocontrol',
    version: 1,
    exportedAt: new Date().toISOString(),
    mode: db.getBackendMode(),
    products,
    sales,
    customers,
  };
}

export function downloadBackup(data: BackupFile): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `kioscocontrol_backup_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
}

/** Restaura un backup en el store local (reemplaza productos, ventas y clientes). */
export function importLocalBackup(json: string): void {
  const parsed = JSON.parse(json) as Partial<BackupFile>;
  if (parsed.app !== 'kioscocontrol') throw new Error('El archivo no es un backup de KioscoControl');

  let store: Record<string, unknown> = {};
  try {
    store = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    store = {};
  }
  store.products = parsed.products || [];
  store.sales = parsed.sales || [];
  store.customers = parsed.customers || [];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}
