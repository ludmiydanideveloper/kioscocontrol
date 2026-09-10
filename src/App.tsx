import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { HeaderNav, NavTab } from './components/HeaderNav';
import { QuickSalesPOS } from './components/QuickSalesPOS';
import { LowStockAlerts } from './components/LowStockAlerts';
import { InventoryManager } from './components/InventoryManager';
import { CustomersView } from './components/CustomersView';
import { CashRegister } from './components/CashRegister';
import { LockScreen } from './components/LockScreen';
import { SettingsModal } from './components/SettingsModal';
import { Product, Customer, CashSession } from './types';
import { soundFX } from './utils/audio';
import { supabase } from './utils/supabase';
import * as db from './utils/db';
import type { BackendMode } from './utils/db';
import { isUnlocked, lockNow, isPinSet } from './utils/lock';
import { AlertCircle, ShieldCheck, WifiOff } from 'lucide-react';

const ReportsView = lazy(() =>
  import('./components/ReportsView').then((m) => ({ default: m.ReportsView })),
);
const BarcodeScannerModal = lazy(() =>
  import('./components/BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal })),
);

type Toast = { message: string; type: 'info' | 'warning' | 'success' | 'error' };

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [backendMode, setBackendMode] = useState<BackendMode>('local');
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'pos' | 'custom'>('pos');
  const customScannerCallbackRef = useRef<((barcode: string) => void) | null>(null);
  const [posScan, setPosScan] = useState<{ code: string; n: number } | null>(null);
  const scanCounter = useRef(0);

  const [locked, setLocked] = useState(!isUnlocked());
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = useCallback((t: Toast, ms = 3200) => {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }, []);

  // -------------------------------------------------------------------------
  // Carga de datos
  // -------------------------------------------------------------------------
  const refreshProducts = useCallback(async () => {
    try {
      setProducts(await db.fetchProducts());
      setLoadError(null);
    } catch (err) {
      console.error('Error cargando productos:', err);
      setLoadError('No se pudo conectar con la base. Revisá tus credenciales en .env.local y el schema.sql.');
    }
  }, []);

  const refreshCustomers = useCallback(async () => {
    try {
      setCustomers(await db.fetchCustomers());
    } catch (err) {
      console.error('Error cargando clientes:', err);
    }
  }, []);

  const refreshCashSession = useCallback(async () => {
    try {
      setCashSession(await db.fetchOpenCashSession());
    } catch (err) {
      console.error('Error cargando caja:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const chosen = await db.initBackend();
      if (cancelled) return;
      setBackendMode(chosen);
      await Promise.all([refreshProducts(), refreshCustomers(), refreshCashSession()]);
      if (cancelled) return;
      setIsLoading(false);

      if (chosen === 'supabase') {
        channel = supabase
          .channel('kiosco-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refreshProducts)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, refreshCustomers)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_sessions' }, refreshCashSession)
          .subscribe((status) => !cancelled && setIsConnected(status === 'SUBSCRIBED'));
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refreshProducts, refreshCustomers, refreshCashSession]);

  // -------------------------------------------------------------------------
  // Escáner físico (lector USB / Bluetooth que "tipea" + Enter)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const now = Date.now();
      if (now - lastKeyTime > 120) buffer = '';
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          handleScannedBarcode(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const handleScannedBarcode = (raw: string) => {
    const barcode = raw.trim();

    // Modo formulario (dar de alta un producto, etc.)
    if (customScannerCallbackRef.current) {
      customScannerCallbackRef.current(barcode);
      customScannerCallbackRef.current = null;
      setIsScannerOpen(false);
      return;
    }

    // Modo POS: mandar el código al carrito
    const matched = products.find((p) => p.barcode === barcode);
    if (matched) {
      soundFX.playBarcodeBeep();
      scanCounter.current += 1;
      setPosScan({ code: barcode, n: scanCounter.current });
      setCurrentTab('pos');
    } else {
      soundFX.playErrorBuzz();
      showToast(
        { message: `Código no registrado: ${barcode}. Dalo de alta en "Inventario".`, type: 'warning' },
        5000,
      );
    }
  };

  const openScannerForPOS = () => {
    customScannerCallbackRef.current = null;
    setScannerMode('pos');
    setIsScannerOpen(true);
  };

  const openScannerForBarcode = (onScanned: (code: string) => void) => {
    customScannerCallbackRef.current = onScanned;
    setScannerMode('custom');
    setIsScannerOpen(true);
  };

  const handleToggleAudio = () => {
    soundFX.enabled = !soundFX.enabled;
    setIsAudioMuted(!soundFX.enabled);
  };

  // -------------------------------------------------------------------------
  // Handlers de inventario
  // -------------------------------------------------------------------------
  const handleSaveProduct = async (data: Partial<Product>) => {
    const isEdit = !!data.id;
    await db.saveProduct(data);
    await refreshProducts();
    showToast({ message: `Producto ${isEdit ? 'actualizado' : 'creado'} correctamente`, type: 'success' });
  };

  const handleDeleteProduct = async (id: string) => {
    await db.deactivateProduct(id);
    await refreshProducts();
    showToast({ message: 'Producto dado de baja', type: 'info' });
  };

  const handleAdjustStock = async (productId: string, amount: number, reason: string) => {
    await db.adjustStock(productId, amount, reason);
    await refreshProducts();
  };

  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const outOfStockCount = products.filter((p) => p.stock === 0).length;
  const receivablesTotal = customers.reduce((acc, c) => acc + Math.max(0, c.balance), 0);

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  return (
    <div className="min-h-screen bg-[#F9F9F7] text-[#1A1A1A] flex flex-col selection:bg-black selection:text-white">
      <HeaderNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        receivablesTotal={receivablesTotal}
        cashOpen={!!cashSession}
        backendMode={backendMode}
        isConnected={isConnected}
        onOpenScanner={openScannerForPOS}
        isAudioMuted={isAudioMuted}
        onToggleAudio={handleToggleAudio}
        onOpenSettings={() => setShowSettings(true)}
        pinEnabled={isPinSet()}
        onLock={() => { lockNow(); setLocked(true); }}
      />

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 border-2 border-black text-xs font-bold flex items-center space-x-2 max-w-md bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <AlertCircle
            className={`w-4 h-4 flex-shrink-0 ${
              toast.type === 'warning'
                ? 'text-amber-600'
                : toast.type === 'success'
                ? 'text-emerald-700'
                : toast.type === 'error'
                ? 'text-red-600'
                : 'text-black'
            }`}
          />
          <span>{toast.message}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs uppercase tracking-widest font-bold opacity-60">
              Cargando base de datos del kiosco...
            </p>
          </div>
        ) : loadError ? (
          <div className="max-w-lg mx-auto mt-10 bg-white border-2 border-black p-6 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <WifiOff className="w-10 h-10 mx-auto mb-3 text-red-600" />
            <h2 className="text-sm font-bold uppercase tracking-widest mb-2">Sin conexión a la base</h2>
            <p className="text-xs font-serif italic text-neutral-600 mb-4">{loadError}</p>
            <button
              onClick={() => { setIsLoading(true); refreshProducts().finally(() => setIsLoading(false)); }}
              className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {currentTab === 'pos' && (
              <QuickSalesPOS
                products={products}
                customers={customers}
                cashSession={cashSession}
                pendingScan={posScan}
                onScanConsumed={() => setPosScan(null)}
                onOpenScanner={openScannerForPOS}
                onSaleCompleted={async () => {
                  await Promise.all([refreshProducts(), refreshCustomers(), refreshCashSession()]);
                }}
                onToast={showToast}
              />
            )}

            {currentTab === 'alerts' && (
              <LowStockAlerts products={products} onAdjustStock={handleAdjustStock} />
            )}

            {currentTab === 'inventory' && (
              <InventoryManager
                products={products}
                onSaveProduct={handleSaveProduct}
                onDeleteProduct={handleDeleteProduct}
                onAdjustStock={handleAdjustStock}
                onOpenScannerForBarcode={openScannerForBarcode}
                onRefresh={refreshProducts}
                onToast={showToast}
              />
            )}

            {currentTab === 'customers' && (
              <CustomersView
                customers={customers}
                cashSession={cashSession}
                onRefresh={refreshCustomers}
                onToast={showToast}
              />
            )}

            {currentTab === 'cash' && (
              <CashRegister
                cashSession={cashSession}
                onRefresh={refreshCashSession}
                onToast={showToast}
              />
            )}

            {currentTab === 'reports' && (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <ReportsView products={products} customers={customers} onDataChanged={refreshProducts} />
              </Suspense>
            )}
          </>
        )}
      </main>

      {isScannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScan={handleScannedBarcode}
            title={scannerMode === 'pos' ? 'Escanear para Venta Rápida' : 'Escanear Código de Barras'}
            continuousMode={scannerMode === 'pos'}
          />
        </Suspense>
      )}

      {showSettings && (
        <SettingsModal
          backendMode={backendMode}
          onClose={() => setShowSettings(false)}
          onToast={showToast}
          onDataRestored={() => {
            refreshProducts();
            refreshCustomers();
          }}
        />
      )}

      <footer className="hidden sm:block border-t-2 border-black bg-[#F2F2EF] py-3 text-center text-[11px] text-[#1A1A1A]/80">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span className="font-medium">
              {backendMode === 'supabase'
                ? 'KioscoControl · Base central con sincronización en tiempo real'
                : 'KioscoControl · Modo local (datos en este dispositivo)'}
            </span>
          </div>
          <span className="font-mono">
            {cashSession ? 'CAJA ABIERTA' : 'CAJA CERRADA'} · {products.length} productos
          </span>
        </div>
      </footer>
    </div>
  );
}
