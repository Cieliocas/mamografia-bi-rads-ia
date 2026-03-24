export function SplashScreen({ status }: { status: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-6">
      <div className="text-3xl font-bold tracking-wide">Mammo BI-RADS Desktop</div>
      <div className="w-72 h-2 bg-slate-800 rounded overflow-hidden">
        <div className="h-full bg-cyan-500 animate-pulse" style={{ width: '65%' }} />
      </div>
      <p className="text-sm text-slate-300">{status}</p>
    </div>
  );
}
