import { StatusDot } from '../ui/StatusDot';
import { useTranslation } from 'react-i18next';

type PageKey = 'dashboard' | 'kanban' | 'automations' | 'docs' | 'memory' | 'agents' | 'skills' | 'models';

export function MobileNav({
  page,
  onSelectPage,
}: {
  page: PageKey;
  onSelectPage: (p: PageKey) => void;
}) {
  const { t } = useTranslation();
  const items: { key: PageKey; label: string }[] = [
    { key: 'dashboard', label: t('Dashboard') },
    { key: 'kanban', label: t('Kanban') },
    { key: 'automations', label: t('Flows') },
    { key: 'agents', label: t('Agents') },
    { key: 'models', label: t('Models') },
  ];
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur">
      <div className="absolute inset-0 bg-gradient-to-t from-background/70 to-transparent pointer-events-none" />
      <div className="grid grid-cols-5 gap-1 px-2 py-2 text-[11px] text-muted-foreground">
        {items.map((item) => {
          const active = page === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectPage(item.key)}
              className={
                'flex flex-col items-center justify-center gap-1 rounded-md px-1 py-1 transition ' +
                (active ? 'bg-surface-2/70 text-foreground' : 'hover:bg-surface-2/40')
              }
            >
              <StatusDot tone={active ? 'info' : 'muted'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
