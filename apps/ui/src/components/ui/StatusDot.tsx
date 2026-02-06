import { cn } from '../../lib/cn';

type StatusTone = 'muted' | 'success' | 'info' | 'warning' | 'danger';

export function StatusDot({
  tone = 'muted',
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        tone === 'muted' && 'bg-foreground/30',
        tone === 'success' && 'bg-success',
        tone === 'info' && 'bg-info',
        tone === 'warning' && 'bg-warning',
        tone === 'danger' && 'bg-danger',
        pulse && 'animate-pulse',
        className,
      )}
    />
  );
}
