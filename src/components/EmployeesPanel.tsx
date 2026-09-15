import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Pencil, KeyRound, LogIn, LogOut, History } from 'lucide-react';
import { listEmployees, createEmployee, updateEmployee, listEmployeeSessions } from '../utils/auth';
import type { EmployeeSessionEvent } from '../utils/auth';
import type { Employee, EmployeePermissions } from '../types';
import { PERMISSION_LABELS } from '../types';
import { Button, Input, Label, Modal, Badge, Empty, cx } from './ui';

interface Props {
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as (keyof EmployeePermissions)[];

const PermissionCheckboxes: React.FC<{
  value: EmployeePermissions;
  onChange: (v: EmployeePermissions) => void;
}> = ({ value, onChange }) => (
  <div>
    <Label>Puede ver además de Vender</Label>
    <div className="grid grid-cols-2 gap-2">
      {PERMISSION_KEYS.map((key) => (
        <label
          key={key}
          className={cx(
            'flex items-center gap-2 rounded-lg border border-line px-2.5 h-9 text-[13px] cursor-pointer',
            value[key] ? 'bg-brand-soft border-brand/25 text-brand' : 'text-ink-soft',
          )}
        >
          <input
            type="checkbox"
            checked={!!value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            className="accent-current"
          />
          {PERMISSION_LABELS[key]}
        </label>
      ))}
    </div>
  </div>
);

export const EmployeesPanel: React.FC<Props> = ({ onToast }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sessions, setSessions] = useState<EmployeeSessionEvent[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEmployees(await listEmployees());
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudieron cargar los empleados', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!showActivity) return;
    listEmployeeSessions().then(setSessions).catch(() => {});
  }, [showActivity]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Cada empleado entra con su propio PIN y sólo ve el punto de venta más lo que le habilites acá.
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)} className="shrink-0">
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          Agregar
        </Button>
      </div>

      {loading ? null : employees.length === 0 ? (
        <Empty title="Todavía no agregaste empleados" hint='Tocá "Agregar" para crear el primero.' />
      ) : (
        <div className="space-y-2">
          {employees.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium truncate">{e.name || 'Sin nombre'}</span>
                  <Badge tone={e.active ? 'green' : 'neutral'}>{e.active ? 'Activo' : 'Desactivado'}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PERMISSION_KEYS.filter((k) => e.permissions[k]).map((k) => (
                    <Badge key={k}>{PERMISSION_LABELS[k]}</Badge>
                  ))}
                  {PERMISSION_KEYS.every((k) => !e.permissions[k]) && (
                    <span className="text-xs text-muted">Sólo Vender</span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(e)} className="shrink-0">
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {employees.length > 0 && (
        <div>
          <button
            onClick={() => setShowActivity((v) => !v)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <History className="h-3.5 w-3.5" strokeWidth={2} />
            {showActivity ? 'Ocultar actividad reciente' : 'Ver entradas y salidas'}
          </button>
          {showActivity && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-line p-2.5 max-h-56 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="text-xs text-muted px-1 py-1">Todavía no hay actividad registrada.</p>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-[13px] px-1">
                    {s.event === 'login' ? (
                      <LogIn className="h-3.5 w-3.5 text-brand shrink-0" strokeWidth={2} />
                    ) : (
                      <LogOut className="h-3.5 w-3.5 text-muted shrink-0" strokeWidth={2} />
                    )}
                    <span className="font-medium truncate">{s.employeeName || 'Empleado'}</span>
                    <span className="text-muted">{s.event === 'login' ? 'entró' : 'salió'}</span>
                    <span className="ml-auto text-xs text-muted nums shrink-0">
                      {new Date(s.createdAt).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddEmployeeModal
          onClose={() => setShowAdd(false)}
          onToast={onToast}
          onDone={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
      {editing && (
        <EditEmployeeModal
          employee={editing}
          onClose={() => setEditing(null)}
          onToast={onToast}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
};

const AddEmployeeModal: React.FC<{
  onClose: () => void;
  onDone: () => void;
  onToast: Props['onToast'];
}> = ({ onClose, onDone, onToast }) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [permissions, setPermissions] = useState<EmployeePermissions>({});
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      onToast({ message: 'Ponele un nombre al empleado', type: 'warning' });
      return;
    }
    if (!/^\d{6,8}$/.test(pin)) {
      onToast({ message: 'El PIN debe tener entre 6 y 8 dígitos', type: 'warning' });
      return;
    }
    if (!adminPassword) {
      onToast({ message: 'Confirmá con tu contraseña/PIN actual', type: 'warning' });
      return;
    }
    try {
      setBusy(true);
      await createEmployee(name.trim(), pin, adminPassword);
      onToast({ message: 'Empleado creado', type: 'success' });
      onDone();
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo crear el empleado', type: 'error' }, 7000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Agregar empleado"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Creando…' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="PIN (6 a 8 dígitos)"
          className="nums"
        />
        <PermissionCheckboxes value={permissions} onChange={setPermissions} />
        <div>
          <Label>Tu contraseña/PIN actual</Label>
          <Input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Para confirmar que sos vos"
          />
        </div>
      </div>
    </Modal>
  );
};

const EditEmployeeModal: React.FC<{
  employee: Employee;
  onClose: () => void;
  onDone: () => void;
  onToast: Props['onToast'];
}> = ({ employee, onClose, onDone, onToast }) => {
  const [name, setName] = useState(employee.name || '');
  const [permissions, setPermissions] = useState<EmployeePermissions>(employee.permissions);
  const [active, setActive] = useState(employee.active);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    try {
      setBusy(true);
      await updateEmployee(employee.id, name.trim(), permissions, active);
      onToast({ message: 'Empleado actualizado', type: 'success' });
      onDone();
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo actualizar', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Editar empleado"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <PermissionCheckboxes value={permissions} onChange={setPermissions} />
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Cuenta activa (puede iniciar sesión)
        </label>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={2} />
          El empleado cambia su propio PIN desde el punto de venta; no hay forma de vérselo ni de resetéarselo sin
          que él lo sepa.
        </p>
      </div>
    </Modal>
  );
};
