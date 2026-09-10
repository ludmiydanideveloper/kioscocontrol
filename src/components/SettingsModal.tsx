import React, { useState, useRef } from 'react';
import { Lock, Unlock, Download, Upload, ShieldCheck, HardDrive } from 'lucide-react';
import { isPinSet, setPin, clearPin, verifyPin } from '../utils/lock';
import { exportData, downloadBackup, importLocalBackup } from '../utils/backup';
import { getBusinessName, setBusinessName } from '../utils/printTicket';
import type { BackendMode } from '../utils/db';
import { Modal, Button, Input, Label, cx } from './ui';

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

  return (
    <Modal title="Configuración" onClose={onClose}>
      <div className="space-y-6">
        <section>
          <Label>Nombre del kiosco</Label>
          <div className="flex gap-2">
            <Input
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Aparece en el ticket impreso"
            />
            <Button
              variant="primary"
              onClick={() => {
                setBusinessName(business.trim() || 'KioscoControl');
                onToast({ message: 'Nombre guardado', type: 'success' });
              }}
            >
              Guardar
            </Button>
          </div>
        </section>

        <section>
          <Label>Almacenamiento</Label>
          <div
            className={cx(
              'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px]',
              backendMode === 'supabase'
                ? 'border-brand/25 bg-brand-soft text-brand'
                : 'border-warn/25 bg-warn-soft text-warn',
            )}
          >
            {backendMode === 'supabase' ? (
              <>
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
                <span>Base central (Supabase). Se sincroniza entre dispositivos.</span>
              </>
            ) : (
              <>
                <HardDrive className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
                <span>Modo local: los datos viven en este navegador. Hacé copias de seguridad seguido.</span>
              </>
            )}
          </div>
        </section>

        <section>
          <Label>PIN de acceso</Label>
          {!pinSet ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">Pide un PIN al abrir la app. Se guarda sólo en este dispositivo.</p>
              <Input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Nuevo PIN (4 a 8 dígitos)"
                className="nums"
              />
              <Button variant="primary" className="w-full" onClick={savePin}>
                <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                Activar PIN
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-brand">PIN activo.</p>
              <Input
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                placeholder="PIN actual para desactivar"
                className="nums"
              />
              <Button variant="secondary" className="w-full" onClick={removePin}>
                <Unlock className="h-3.5 w-3.5" strokeWidth={2} />
                Desactivar PIN
              </Button>
            </div>
          )}
        </section>

        <section>
          <Label>Copia de seguridad</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={doExport} disabled={busy}>
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Exportar
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={backendMode === 'supabase'}
              title={backendMode === 'supabase' ? 'La importación sólo aplica en modo local' : ''}
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={2} />
              Importar
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
          <p className="mt-1.5 text-xs text-muted">El archivo incluye productos, ventas y clientes.</p>
        </section>
      </div>
    </Modal>
  );
};
