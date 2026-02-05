import { QueryClient } from '@tanstack/react-query';

type DzzenosEvent = {
  ts: number;
  type: string;
  payload?: any;
};

export function startRealtime(opts: {
  apiBase: string;
  qc: QueryClient;
  onStatus?: (s: { connected: boolean; error?: string }) => void;
}) {
  const url = `${opts.apiBase.replace(/\/$/, '')}/events`;
  const es = new EventSource(url);

  opts.onStatus?.({ connected: false });

  es.addEventListener('open', () => {
    opts.onStatus?.({ connected: true });
  });

  es.addEventListener('error', () => {
    opts.onStatus?.({ connected: false, error: 'realtime disconnected' });
  });

  es.addEventListener('dzzenos', (ev) => {
    try {
      const msg = JSON.parse((ev as MessageEvent).data) as DzzenosEvent;

      // Keep it simple for v1: invalidate relevant caches.
      if (msg.type === 'tasks.changed') {
        opts.qc.invalidateQueries({ queryKey: ['tasks'] });
      }
      if (msg.type === 'approvals.changed') {
        opts.qc.invalidateQueries({ queryKey: ['approvals'] });
      }
      if (msg.type === 'runs.changed') {
        opts.qc.invalidateQueries({ queryKey: ['runs'] });
      }
      if (msg.type === 'automations.changed') {
        opts.qc.invalidateQueries({ queryKey: ['automations'] });
      }
    } catch {
      // ignore
    }
  });

  return () => {
    es.close();
  };
}
