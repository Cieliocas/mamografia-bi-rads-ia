import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mammo.acceptedEula';

export function TermsGate({ onAccepted }: { onAccepted: () => void }) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY) === 'true';
    if (cached) {
      onAccepted();
    }
  }, [onAccepted]);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setAccepted(true);
    onAccepted();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Termos de Uso (EULA)</h1>
        <p className="text-sm text-slate-300">
          Este software de apoio diagnóstico não substitui decisão clínica. O uso implica concordância com LGPD e políticas internas.
        </p>
        <label className="flex gap-2 items-center text-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          Eu concordo com os termos de uso.
        </label>
        <button
          className="px-4 py-2 rounded bg-cyan-600 disabled:opacity-50"
          disabled={!accepted}
          onClick={accept}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
