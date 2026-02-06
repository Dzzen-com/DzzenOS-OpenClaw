import type { ReactNode } from 'react';
import { useMobileNav } from '../../state/mobile-nav';
import { useTranslation } from 'react-i18next';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const mobileNav = useMobileNav();
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          className="sm:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-surface-2/40 text-foreground/80"
          aria-label={t('Open menu')}
          onClick={() => mobileNav.toggle()}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
            <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-tight text-foreground font-display">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
