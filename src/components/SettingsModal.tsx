import React, { useState, useRef } from 'react';
import { X, Lock, Unlock, Download, Upload, Database, ShieldCheck } from 'lucide-react';
import { isPinSet, setPin, clearPin, verifyPin } from '../utils/lock';
import { exportData, downloadBackup, importLocalBackup } from '../utils/backup';
import { getBusinessName, setBusinessName } from '../utils/printTicket';
import type { BackendMode } from '../utils/db';

interface Props {
  backendMode: BackendMode;
  onClose: () => void;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
  onDataRestored: () => void;
}

export const SettingsModal: React.FC<Props> = ({ backendMode, onClose, onToast, onDataRestored }) => {
  const [pinSet, setPinSet] = useState(isPinSet());
  const [newPin, setNewPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [business, setBusiness] = useState(getBusinessName());
  const fileRef = useRef<HTMLInputElement>(null);

  const savePin = async () => {
    if (!/^\d{4,8}$/.test(newPin)) {
      onToast({ message: 'El PIN debe tener entre 4 y 8 dígitos', type: 'warning' });
      return;
    }
    await setPin(newPin);
    setPinSet(true);
    setNewPin('');
    onToast({ message: 'PIN activado', type: 'success' });
  };

  const removePin = async () => {
    if (!(await verifyPin(currentPin))) {
      onToast({ message: 'PIN actual incorrecto', type: 'warning' });
      return;
    }
    clearPin();
    setPinSet(false);
    setCurrentPin('');
    onToast({ message: 'PIN desactivado', type: 'info' });
  };

  const doExport = async () => {
    try {
      setBusy(true);
      downloadBackup(await exportData());
      onToast({ message: 'Backup descargado', type: 'success' });
    } catch (err: any) {
      onToast({ message: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importLocalBackup(String(reader.result));
        onToast({ message: 'Datos restaurados', type: 'success' });
        onDataRestored();
        onClose();
      } catch (err: any) {
        onToast({ message: err.message || 'Archivo inválido', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const field = 'w-full bg-white border-2 border-black px-3 py-2 text-sm font-mono outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b-2 border-black bg-[#F2F2EF] flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider">Configuración</h3>
          <button onClick={onClose} className="font-bold p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Nombre del negocio */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Nombre del kiosco</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                placeholder="Aparece en el ticket impreso"
                className="flex-1 bg-white border-2 border-black px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={() => {
                  setBusinessName(business.trim() || 'KioscoControl');
                  onToast({ message: 'Nombre guardado', type: 'success' });
                }}
                className="px-3 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider border-2 border-black"
              >
                Guardar
              </button>
            </div>
          </section>

          {/* Backend */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> Almacenamiento
            </h4>
            <div
              className={`p-3 border-2 text-xs ${
                backendMode === 'supabase'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                  : 'border-amber-600 bg-amber-50 text-amber-900'
              }`}
            >
              {backendMode === 'supabase' ? (
                <span className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4" /> Base central (Supabase) — sincroniza entre dispositivos.
                </span>
              ) : (
                <span className="font-bold">
                  Modo local — los datos viven en este navegador. Hacé backups seguido.
                </span>
              )}
            </div>
          </section>

          {/* PIN */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> PIN de acceso
            </h4>
            {!pinSet ? (
              <div className="space-y-2">
                <p className="text-[11px] font-serif italic text-neutral-600">
                  Pide un PIN al abrir la app. Se guarda sólo en este dispositivo.
                </p>
                <input
                  type="password"
                  inputMode="numeric"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Nuevo PIN (4 a 8 dígitos)"
                  className={field}
                />
                <button
                  onClick={savePin}
                  className="w-full py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black"
                >
                  Activar PIN
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-serif italic text-emerald-700">PIN activo.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN actual para desactivar"
                  className={field}
                />
                <button
                  onClick={removePin}
                  className="w-full py-2.5 bg-[#F2F2EF] text-black text-xs font-bold uppercase tracking-widest border-2 border-black flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" /> Desactivar PIN
                </button>
              </div>
            )}
          </section>

          {/* Backup */}
          <section>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-2">Copia de seguridad</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={doExport}
                disabled={busy}
                className="py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" /> Exportar
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={backendMode === 'supabase'}
                className="py-2.5 bg-[#F2F2EF] text-black text-xs font-bold uppercase tracking-wider border-2 border-black flex items-center justify-center gap-1.5 disabled:opacity-40"
                title={backendMode === 'supabase' ? 'La importación sólo aplica en modo local' : ''}
              >
                <Upload className="w-3.5 h-3.5" /> Importar
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
            />
            <p className="text-[11px] font-serif italic text-neutral-600 mt-1.5">
              El archivo incluye productos, ventas y clientes.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
