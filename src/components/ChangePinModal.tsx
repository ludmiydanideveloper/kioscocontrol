import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changeOwnPin } from '../utils/auth';
import { Modal, Button, Input } from './ui';

interface Props {
  onClose: () => void;
  onToast: (t: { message: string; type: 'info' | 'warning' | 'success' | 'error' }, ms?: number) => void;
}

/** Autoservicio: el usuario logueado (típicamente el vendedor) cambia su propio PIN. */
export const ChangePinModal: React.FC<Props> = ({ onClose, onToast }) => {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^\d{6,8}$/.test(next)) {
      onToast({ message: 'El PIN debe tener entre 6 y 8 dígitos', type: 'warning' });
      return;
    }
    if (next !== confirm) {
      onToast({ message: 'Los PIN no coinciden', type: 'warning' });
      return;
    }
    try {
      setBusy(true);
      await changeOwnPin(next);
      onToast({ message: 'PIN actualizado', type: 'success' });
      onClose();
    } catch (err: any) {
      onToast({ message: err.message || 'No se pudo cambiar el PIN', type: 'error' }, 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Cambiar mi PIN" onClose={onClose} size="sm">
      <div className="space-y-3">
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          value={next}
          onChange={(e) => setNext(e.target.value.replace(/\D/g, ''))}
          placeholder="Nuevo PIN (6 a 8 dígitos)"
          className="nums"
        />
        <Input
          type="password"
          inputMode="numeric"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
          placeholder="Repetí el nuevo PIN"
          className="nums"
        />
        <Button variant="primary" className="w-full" onClick={save} disabled={busy}>
          <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
          Guardar
        </Button>
      </div>
    </Modal>
  );
};
