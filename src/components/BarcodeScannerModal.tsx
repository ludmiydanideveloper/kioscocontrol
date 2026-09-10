import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Zap, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { soundFX } from '../utils/audio';
import { cx } from './ui';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  continuousMode?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Escanear Código de Barras',
  continuousMode = false,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(continuousMode);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const containerId = 'kiosco-barcode-reader';

  // Handle successful barcode read
  const handleBarcodeDecoded = useCallback((decodedText: string) => {
    // Avoid double triggering the exact same barcode within 1.2s
    if (decodedText === lastScanned) {
      return;
    }

    soundFX.playBarcodeBeep();
    setLastScanned(decodedText);
    onScan(decodedText);

    if (!continuous) {
      // Single scan mode: close
      setTimeout(() => {
        onClose();
      }, 350);
    } else {
      // Clear lastScanned after delay to allow re-scanning same item
      setTimeout(() => {
        setLastScanned(null);
      }, 1500);
    }
  }, [lastScanned, continuous, onScan, onClose]);

  // Start scanner instance
  const startScanner = useCallback(async (cameraId?: string) => {
    try {
      setIsStarting(true);
      setErrorMsg(null);

      // Stop previous instance if running
      if (scannerRef.current && isScanningRef.current) {
        await scannerRef.current.stop().catch(() => {});
        isScanningRef.current = false;
      }

      const html5QrCode = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.ITF
        ],
        verbose: false
      });
      scannerRef.current = html5QrCode;

      // Get available cameras
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        throw new Error('No se detectó ninguna cámara en este dispositivo.');
      }

      setCameras(devices);

      // Prefer back/environment camera
      let selectedId = cameraId || devices[0].id;
      if (!cameraId) {
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('trasera') || 
          d.label.toLowerCase().includes('environment') ||
          d.label.toLowerCase().includes('posterior')
        );
        if (backCamera) {
          selectedId = backCamera.id;
        } else if (devices.length > 1) {
          selectedId = devices[devices.length - 1].id;
        }
      }
      setActiveCameraId(selectedId);

      const qrBoxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrWidth = Math.floor(minEdge * 0.82);
        const qrHeight = Math.floor(qrWidth * 0.6); // Rectangular box optimized for barcodes
        return { width: qrWidth, height: qrHeight };
      };

      await html5QrCode.start(
        selectedId,
        {
          fps: 15,
          qrbox: qrBoxFunction,
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleBarcodeDecoded(decodedText);
        },
        () => {
          // Frame error (silently ignore)
        }
      );

      isScanningRef.current = true;
      setIsStarting(false);

      // Check torch capability
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && (capabilities as any).torch) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.error('Error starting camera barcode scanner:', err);
      setIsStarting(false);
      setErrorMsg(err?.message || 'No se pudo acceder a la cámara. Revisa los permisos o ingresa el código manualmente.');
    }
  }, [handleBarcodeDecoded]);

  // Stop scanner
  const stopScanner = useCallback(async () => {
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      isScanningRef.current = false;
    }
  }, []);

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      setLastScanned(null);
      setManualCode('');
      setErrorMsg(null);
      // Give DOM time to mount container
      const timer = setTimeout(() => {
        startScanner();
      }, 150);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  // Switch camera toggle
  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    startScanner(cameras[nextIndex].id);
  };

  // Toggle Torch
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !torchOn } as any]
      });
      setTorchOn(!torchOn);
    } catch (err) {
      console.warn('Torch not supported:', err);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    soundFX.playBarcodeBeep();
    onScan(manualCode.trim());
    setManualCode('');
    if (!continuous) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-[2px] p-0 sm:p-4">
      <div className="relative w-full max-w-md bg-surface border border-line rounded-t-2xl sm:rounded-2xl pop-shadow overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
              <Camera className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted">Apuntá al código de barras</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="-mr-1.5 p-1.5 rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="relative flex-1 bg-black min-h-[260px] max-h-[360px] flex items-center justify-center overflow-hidden">
          <div id={containerId} className="w-full h-full object-cover" />

          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
            <div className="relative w-64 h-36 rounded-xl flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              <div className="absolute -top-px -left-px h-5 w-5 border-t-2 border-l-2 border-white rounded-tl-xl" />
              <div className="absolute -top-px -right-px h-5 w-5 border-t-2 border-r-2 border-white rounded-tr-xl" />
              <div className="absolute -bottom-px -left-px h-5 w-5 border-b-2 border-l-2 border-white rounded-bl-xl" />
              <div className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-white rounded-br-xl" />
              <div className="w-full h-0.5 bg-white/70 animate-pulse" />
              {lastScanned && (
                <div className="absolute bottom-2 flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Detectado
                </div>
              )}
            </div>
          </div>

          {isStarting && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface/95">
              <div className="h-6 w-6 border-2 border-line-strong border-t-ink rounded-full animate-spin" />
              <p className="text-[13px] text-muted">Iniciando cámara…</p>
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
              <AlertCircle className="h-8 w-8 text-danger" strokeWidth={1.5} />
              <p className="text-[13px] text-danger">{errorMsg}</p>
              <button
                onClick={() => startScanner()}
                className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink/90"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-line text-[13px]">
          <div className="flex items-center gap-1.5">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 h-8 font-medium text-ink-soft hover:border-line-strong"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Cámara
              </button>
            )}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={cx(
                  'inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 font-medium transition-colors',
                  torchOn ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft hover:border-line-strong',
                )}
              >
                <Zap className="h-3.5 w-3.5" /> Flash
              </button>
            )}
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-ink-soft">
            <input
              type="checkbox"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Modo continuo
          </label>
        </div>

        <div className="p-3 border-t border-line">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="O escribí el código a mano…"
                className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-sm nums outline-none focus:border-ink/30 focus:ring-2 focus:ring-ink/10"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
            >
              Agregar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
