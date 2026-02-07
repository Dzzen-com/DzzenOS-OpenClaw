import { StatusDot } from '../ui/StatusDot';
import { useTranslation } from 'react-i18next';

type ConnectionState = 'connected' | 'checking' | 'disconnected';

function toneFor(state: ConnectionState) {
  if (state === 'connected') return 'success';
  if (state === 'checking') return 'warning';
  return 'danger';
}

export function Footer({
  apiBase,
  apiStatus,
  realtimeStatus,
  onSelectDocs,
}: {
  apiBase: string;
  apiStatus: ConnectionState;
  realtimeStatus: ConnectionState;
  onSelectDocs: () => void;
}) {
  const { t } = useTranslation();
  const apiLabel = apiBase.replace(/^https?:\/\//, '');
  return (
    <footer className="border-t border-border/60 bg-background/70 px-4 py-3 text-xs text-muted-foreground backdrop-blur sm:px-6 mb-16 sm:mb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <StatusDot tone={toneFor(apiStatus)} />
            <span>{t('API')}: {apiStatus}</span>
            <span className="hidden sm:inline text-foreground/70 compact-hide">({apiLabel})</span>
          </span>
          <span className="flex items-center gap-2">
            <StatusDot tone={toneFor(realtimeStatus)} />
            <span>{t('Realtime')}: {realtimeStatus}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onSelectDocs}
          className="text-foreground/80 transition hover:text-foreground"
        >
          {t('Docs')}
        </button>
      </div>
    </footer>
  );
}
