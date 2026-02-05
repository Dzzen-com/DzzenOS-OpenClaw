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
        variant === 'default' && 'border-border/70 bg-surface-2/50 text-foreground',
        variant === 'outline' && 'border-border/80 bg-transparent text-foreground',
        variant === 'success' && 'border-success/35 bg-success/15 text-success',
        variant === 'info' && 'border-info/35 bg-info/15 text-info',
        variant === 'warning' && 'border-warning/35 bg-warning/15 text-warning',
        variant === 'danger' && 'border-danger/35 bg-danger/15 text-danger',
        className,
      )}
      {...props}
    />
  );
}
