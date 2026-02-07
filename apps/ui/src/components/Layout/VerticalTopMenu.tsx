import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type VerticalTopMenuItem = {
  key: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  icon?: ReactNode;
};

export function VerticalTopMenu({
  title,
  items,
  activeKey,
  onSelect,
  className,
}: {
  title: string;
  items: VerticalTopMenuItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 rounded-md border border-border/70 bg-surface-1/50 p-2', className)}>
      <div className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      <div className="grid gap-1">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => onSelect(item.key)}
              className={cn(
                'h-8 rounded-md border px-2 text-left text-sm transition',
                'flex items-center justify-between gap-2',
                item.disabled && 'cursor-not-allowed opacity-45',
                !item.disabled && active && 'border-primary/60 bg-surface-2/80 text-foreground',
                !item.disabled && !active && 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-2/60 hover:text-foreground'
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.icon ? <span className="text-muted-foreground">{item.icon}</span> : null}
                <span className="truncate">{item.label}</span>
              </span>
              {item.hint ? <span className="truncate text-[10px] text-muted-foreground">{item.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
