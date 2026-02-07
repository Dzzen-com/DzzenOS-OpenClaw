import type { ReactNode } from 'react';

export function AppShell({
  sidebar,
  topbar,
  footer,
  mobileNav,
  children,
}: {
  sidebar: ReactNode;
  topbar?: ReactNode;
  footer?: ReactNode;
  mobileNav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh text-foreground">
      <div className="flex min-h-dvh">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col sm:pl-[288px]">
          {topbar ?? null}
          <main className="min-w-0 flex-1 animate-rise p-4 pb-24 sm:p-6 sm:pb-6">{children}</main>
          {footer ?? null}
        </div>
      </div>
      {mobileNav}
    </div>
  );
}
