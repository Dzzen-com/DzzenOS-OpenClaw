import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-flex group', className)}>
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max -translate-x-1/2 rounded-md border border-border/70 bg-surface-1/90 px-2 py-1 text-[11px] text-foreground opacity-0 shadow-panel backdrop-blur transition group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}
