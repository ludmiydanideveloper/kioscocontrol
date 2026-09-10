import React, { useState } from 'react';
import { Lock, Delete, Store } from 'lucide-react';
import { verifyPin, markUnlocked } from '../utils/lock';
import { soundFX } from '../utils/audio';

export const LockScreen: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const press = async (digit: string) => {
    setError(false);
    const next = (pin + digit).slice(0, 8);
    setPin(next);
    if (next.length >= 4) {
      if (await verifyPin(next)) {
        soundFX.playBarcodeBeep();
        markUnlocked();
        onUnlock();
      } else if (next.length >= 8 || digit === 'check') {
        soundFX.playErrorBuzz();
        setError(true);
        setPin('');
      }
    }
  };

  const submit = async () => {
    if (await verifyPin(pin)) {
      markUnlocked();
      onUnlock();
    } else {
      soundFX.playErrorBuzz();
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#F9F9F7] flex flex-col items-center justify-center p-6">
      <div className="w-14 h-14 bg-black text-white flex items-center justify-center border-2 border-black mb-4">
        <Store className="w-7 h-7" />
      </div>
      <h1 className="text-xl font-black tracking-tighter mb-1">
        KIOSKO<span className="font-serif italic font-normal text-neutral-600">.CONTROL</span>
      </h1>
      <p className="text-xs uppercase tracking-widest font-bold text-black/50 mb-6 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Ingresá tu PIN
      </p>

      <div className="flex gap-2 mb-6 h-4">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={`w-3 h-3 border-2 border-black ${i < pin.length ? 'bg-black' : 'bg-transparent'} ${
              error ? 'border-red-600' : ''
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="aspect-square bg-white border-2 border-black text-xl font-bold font-mono hover:bg-[#F2F2EF] active:bg-neutral-200"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setPin('')}
          className="aspect-square bg-[#F2F2EF] border-2 border-black text-[10px] font-bold uppercase tracking-wider hover:bg-white"
        >
          Borrar
        </button>
        <button
          onClick={() => press('0')}
          className="aspect-square bg-white border-2 border-black text-xl font-bold font-mono hover:bg-[#F2F2EF] active:bg-neutral-200"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="aspect-square bg-[#F2F2EF] border-2 border-black flex items-center justify-center hover:bg-white"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>

      {pin.length >= 4 && (
        <button
          onClick={submit}
          className="mt-5 px-8 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-widest border-2 border-black"
        >
          Desbloquear
        </button>
      )}
      {error && <p className="mt-3 text-xs font-bold text-red-600 uppercase tracking-wider">PIN incorrecto</p>}
    </div>
  );
};
