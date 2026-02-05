import type { ReactNode } from 'react';

export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/15 px-3 py-2 text-sm text-danger">{children}</div>
  );
}
