import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Zap, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { soundFX } from '../utils/audio';

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
    <div id="barcode-scanner-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4">
      <div className="relative w-full max-w-md bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-black bg-[#F2F2EF]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-black">{title}</h3>
              <p className="text-[11px] font-serif italic text-neutral-600">Apunta la cámara al código de barras</p>
            </div>
          </div>
          <button
            id="btn-close-scanner"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-black hover:opacity-60 transition-opacity font-bold"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Canvas Area */}
        <div className="relative flex-1 bg-black min-h-[260px] max-h-[360px] flex items-center justify-center overflow-hidden">
          <div id={containerId} className="w-full h-full object-cover"></div>

          {/* Overlay Targeting Reticle */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
            <div className="relative w-64 h-36 border-2 border-dashed border-white rounded-none flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              {/* Corner markers */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white"></div>
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white"></div>
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white"></div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white"></div>

              {/* Scanning red laser line */}
              <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse"></div>

              {lastScanned && (
                <div className="absolute bottom-2 px-3 py-1 bg-white border-2 border-black text-black text-xs font-mono font-bold uppercase tracking-wider flex items-center space-x-1 shadow-lg animate-bounce">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>¡Detectado!</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-[10px] text-white font-mono uppercase tracking-wider text-center bg-black px-3 py-1 border border-white/20">
              Centra el código de barras en el recuadro
            </p>
          </div>

          {/* Starting indicator */}
          {isStarting && (
            <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center space-y-2 z-10">
              <RefreshCw className="w-8 h-8 text-black animate-spin" />
              <p className="text-xs font-serif italic text-neutral-800">Iniciando cámara del dispositivo...</p>
            </div>
          )}

          {/* Camera Error Message */}
          {errorMsg && (
            <div className="absolute inset-0 bg-white p-6 flex flex-col items-center justify-center text-center z-10">
              <AlertCircle className="w-10 h-10 text-red-600 mb-2" />
              <p className="text-xs font-serif italic text-red-700 mb-4">{errorMsg}</p>
              <button
                onClick={() => startScanner()}
                className="px-4 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider border-2 border-black"
              >
                Reintentar acceso a cámara
              </button>
            </div>
          )}
        </div>

        {/* Camera Controls Bar */}
        <div className="px-4 py-2.5 bg-[#F2F2EF] border-t-2 border-black flex items-center justify-between text-xs text-black">
          <div className="flex items-center space-x-2">
            {cameras.length > 1 && (
              <button
                id="btn-switch-camera"
                type="button"
                onClick={switchCamera}
                className="flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-black hover:text-white text-black border border-black text-xs font-bold uppercase tracking-wider transition-colors"
                title="Cambiar entre cámara trasera y delantera"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Cámara</span>
              </button>
            )}

            {hasTorch && (
              <button
                id="btn-toggle-torch"
                type="button"
                onClick={toggleTorch}
                className={`flex items-center space-x-1 px-2.5 py-1.5 border text-xs font-bold uppercase tracking-wider transition-colors ${
                  torchOn ? 'bg-black text-white border-black' : 'bg-white text-black border-black hover:bg-black hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{torchOn ? 'Flash On' : 'Flash'}</span>
              </button>
            )}
          </div>

          <label className="flex items-center space-x-2 cursor-pointer select-none text-black">
            <input
              type="checkbox"
              id="chk-continuous-mode"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
              className="accent-black h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-[11px] font-bold uppercase tracking-wider">Modo continuo</span>
          </label>
        </div>

        {/* Manual Code Input Alternative */}
        <div className="p-3 bg-white border-t-2 border-black">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                id="input-manual-barcode"
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="O escribe el código (ej. 779...)"
                className="w-full bg-white border-2 border-black pl-9 pr-3 py-2 text-xs text-black placeholder-neutral-400 font-mono outline-none focus:bg-[#FAF9F5]"
              />
            </div>
            <button
              id="btn-submit-manual-barcode"
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2 bg-black hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold uppercase tracking-widest text-xs border-2 border-black transition-colors whitespace-nowrap"
            >
              Agregar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
