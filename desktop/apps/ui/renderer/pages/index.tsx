import { useCallback, useEffect, useState } from 'react';
import { SplashScreen } from '../components/SplashScreen';
import { TermsGate } from '../components/TermsGate';

type BootState = 'checking' | 'eula' | 'ready';

export default function HomePage() {
  const [state, setState] = useState<BootState>('checking');
  const [status, setStatus] = useState('Inicializando serviços locais...');

  const checkStartup = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8088/startup/status');
      if (!response.ok) {
        setStatus('Carregando modelo de IA e validando sidecar...');
        return false;
      }
      return true;
    } catch {
      setStatus('Iniciando orquestrador Go...');
      return false;
    }
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let mounted = true;

    const loop = async () => {
      const ready = await checkStartup();
      if (!mounted) return;
      if (ready) {
        setState('eula');
        return;
      }
      timer = setTimeout(loop, 1000);
    };

    void loop();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [checkStartup]);

  if (state === 'checking') {
    return <SplashScreen status={status} />;
  }

  if (state === 'eula') {
    return <TermsGate onAccepted={() => setState('ready')} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <h1 className="text-3xl font-semibold">Workstation pronta</h1>
      <p className="text-slate-300 mt-2">Go Core e AI Sidecar ativos. Ambiente local e offline habilitado.</p>
    </main>
  );
}
