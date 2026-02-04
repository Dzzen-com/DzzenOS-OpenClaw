export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
      <div className="font-medium text-slate-100">{title}</div>
      {subtitle ? <div className="mt-1 text-slate-400">{subtitle}</div> : null}
    </div>
  );
}
