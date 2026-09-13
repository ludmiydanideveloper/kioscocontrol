import React, { useState, useRef, useEffect } from 'react';
import { Lock, Download, Upload, ShieldCheck, HardDrive, ShoppingCart } from 'lucide-react';
import {
  authRequired,
  cashierEnabled,
  setupAdmin,
  verifyAdmin,
  disableAuth,
  setCashierPin,
  isRealAuth,
} from '../utils/auth';
import { exportData, downloadBackup, importLocalBackup } from '../utils/backup';
import { getBusinessName, setBusinessName } from '../utils/printTicket';
import { hasLocalData, migrateLocalToSupabase } from '../utils/db';
import type { BackendMode } from '../utils/db';
import { EmployeesPanel } from './EmployeesPanel';
import { Modal, Button, Input, Label, cx } from './ui';

interface Props {
  backendMode: BackendMode;
  onClose: () => void;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
  onDataRestored: () => void;
  onAuthChanged: () => void;
}

export const SettingsModal: React.FC<Props> = ({ backendMode, onClose, onToast, onDataRestored, onAuthChanged }) => {
  const realAuth = isRealAuth();
  const [adminSet, setAdminSet] = useState(false);
  const [cashierSet, setCashierSet] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [disablePin, setDisablePin] = useState('');
  const [cashierPin, setCashierPinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [business, setBusiness] = useState(getBusinessName());
  const fileRef = useRef<HTMLInputElement>(null);
  const canMigrate = backendMode === 'supabase' && hasLocalData();
  const minPinLen = realAuth ? 6 : 4;

  useEffect(() => {
    authRequired().then(setAdminSet);
    cashierEnabled().then(setCashierSet);
  }, []);

  const doMigrate = async () => {
    if (!confirm('¿Subir los datos guardados en este navegador a la base central? Se agregan/actualizan; no se borra nada.')) return;
    try {
      setMigrating(true);
      const counts = await migrateLocalToSupabase();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      onToast({ message: `${total} registros subidos a la base central`, type: 'success' });
      onDataRestored();
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo subir', type: 'error' }, 6000);
    } finally {
      setMigrating(false);
    }
  };

  const valid = (p: string) => new RegExp(`^\\d{${minPinLen},8}$`).test(p);

  const saveAdmin = async () => {
    if (!valid(adminPin)) {
      onToast({ message: `El PIN debe tener entre ${minPinLen} y 8 dígitos`, type: 'warning' });
      return;
    }
    if (adminSet && !(await verifyAdmin(disablePin))) {
      onToast({ message: 'PIN de administrador actual incorrecto', type: 'warning' });
      return;
    }
    try {
      setBusy(true);
      await setupAdmin(adminPin);
      setAdminSet(true);
      setAdminPin('');
      setDisablePin('');
      onToast({ message: 'PIN de administrador guardado', type: 'success' });
      onAuthChanged();
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo guardar el PIN', type: 'error' }, 6000);
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (!(await disableAuth(disablePin))) {
      onToast({ message: 'PIN de administrador incorrecto', type: 'warning' });
      return;
    }
    setAdminSet(false);
    setCashierSet(false);
    setDisablePin('');
    onToast({ message: 'PIN desactivado', type: 'info' });
    onAuthChanged();
  };

  // Sólo modo local (en Supabase, los empleados se manejan desde EmployeesPanel).
  const saveCashier = async () => {
    if (!valid(cashierPin)) {
      onToast({ message: `El PIN de vendedor debe tener ${minPinLen} a 8 dígitos`, type: 'warning' });
      return;
    }
    try {
      setBusy(true);
      await setCashierPin(cashierPin);
      setCashierSet(true);
      setCashierPinInput('');
      onToast({ message: 'PIN de vendedor guardado', type: 'success' });
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo guardar el PIN', type: 'error' }, 7000);
    } finally {
      setBusy(false);
    }
  };

  const removeCashier = async () => {
    try {
      setBusy(true);
      await setCashierPin(null);
      setCashierSet(false);
      onToast({ message: 'Acceso de vendedor desactivado', type: 'info' });
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo desactivar', type: 'error' });
    } finally {
      setBusy(false);
    }
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
                setBusinessName(business.trim() || 'Kiosco');
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
          {canMigrate && (
            <div className="mt-2">
              <Button variant="secondary" className="w-full" onClick={doMigrate} disabled={migrating}>
                {migrating ? 'Subiendo…' : 'Subir datos locales a la base central'}
              </Button>
              <p className="mt-1.5 text-xs text-muted">
                Detectamos datos guardados en este navegador. Subilos una vez para no perderlos.
              </p>
            </div>
          )}
        </section>

        <section>
          <Label>PIN de administrador</Label>
          <p className="mb-2 text-xs text-muted">
            {realAuth
              ? 'Login real (Supabase Auth): el PIN es la contraseña de tu cuenta. Se pide siempre para entrar.'
              : 'El administrador ve todo. Sin PIN configurado, la app queda abierta.'}
          </p>
          {adminSet && (
            <Input
              type="password"
              inputMode="numeric"
              value={disablePin}
              onChange={(e) => setDisablePin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN de administrador actual"
              className="nums mb-2"
            />
          )}
          <div className="flex gap-2">
            <Input
              type="password"
              inputMode="numeric"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
              placeholder={adminSet ? 'Nuevo PIN' : `PIN (${minPinLen} a 8 dígitos)`}
              className="nums"
            />
            <Button variant="primary" onClick={saveAdmin} disabled={busy}>
              <Lock className="h-3.5 w-3.5" strokeWidth={2} />
              {adminSet ? 'Cambiar' : 'Activar'}
            </Button>
          </div>
          {adminSet && !realAuth && (
            <Button variant="ghost" className="mt-2 w-full" onClick={removeAll}>
              Desactivar todos los PIN
            </Button>
          )}
          {adminSet && realAuth && (
            <p className="mt-2 text-xs text-muted">
              El login es obligatorio en la base central y no se puede desactivar. Para salir, usá
              "Cerrar sesión" en el encabezado.
            </p>
          )}
        </section>

        {adminSet && realAuth && (
          <section>
            <Label>Empleados</Label>
            <EmployeesPanel onToast={onToast} />
          </section>
        )}

        {adminSet && !realAuth && (
          <section>
            <Label>PIN de vendedor</Label>
            <p className="mb-2 text-xs text-muted">
              El vendedor sólo ve el punto de venta: no accede a costos, reportes, caja ni configuración.
            </p>
            {!cashierSet ? (
              <div className="space-y-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  value={cashierPin}
                  onChange={(e) => setCashierPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder={`PIN de vendedor (${minPinLen} a 8 dígitos)`}
                  className="nums"
                />
                <Button variant="primary" className="w-full" onClick={saveCashier} disabled={busy}>
                  <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} />
                  Activar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-brand">Acceso de vendedor activo.</p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    inputMode="numeric"
                    value={cashierPin}
                    onChange={(e) => setCashierPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Cambiar PIN de vendedor"
                    className="nums"
                  />
                  <Button variant="secondary" onClick={saveCashier} disabled={busy}>
                    Cambiar
                  </Button>
                </div>
                <Button variant="ghost" className="w-full" onClick={removeCashier} disabled={busy}>
                  Desactivar acceso de vendedor
                </Button>
              </div>
            )}
          </section>
        )}

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
