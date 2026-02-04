import * as React from 'react';
import { cn } from '../../lib/cn';

type BadgeVariant = 'default' | 'outline' | 'success' | 'info' | 'warning' | 'danger';

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        variant === 'default' && 'border-border/70 bg-muted/40 text-foreground',
        variant === 'outline' && 'border-border/80 bg-transparent text-foreground',
        variant === 'success' && 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
        variant === 'info' && 'border-indigo-400/25 bg-indigo-400/10 text-indigo-200',
        variant === 'warning' && 'border-amber-400/25 bg-amber-400/10 text-amber-200',
        variant === 'danger' && 'border-rose-400/25 bg-rose-400/10 text-rose-200',
        className,
      )}
      {...props}
    />
  );
}
