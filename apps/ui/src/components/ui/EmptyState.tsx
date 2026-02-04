export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-6 text-sm text-muted-foreground shadow-panel">
      <div className="font-medium text-foreground">{title}</div>
      {subtitle ? <div className="mt-1 text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}
