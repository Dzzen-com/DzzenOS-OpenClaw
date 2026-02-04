import type { ReactNode } from 'react';

export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{children}</div>
  );
}
