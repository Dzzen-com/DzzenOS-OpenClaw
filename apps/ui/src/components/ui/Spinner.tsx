export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border/60 border-t-foreground/60" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
