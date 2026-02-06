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

      // Keep it simple for v1, but prefer targeted invalidations.
      if (msg.type === 'tasks.changed') {
        const boardId = msg.payload?.boardId as string | null | undefined;
        const taskId = msg.payload?.taskId as string | null | undefined;
        if (boardId) opts.qc.invalidateQueries({ queryKey: ['tasks', boardId] });
        else opts.qc.invalidateQueries({ queryKey: ['tasks'] });
        if (taskId) {
          opts.qc.invalidateQueries({ queryKey: ['execution-config', taskId] });
          opts.qc.invalidateQueries({ queryKey: ['context-items', taskId] });
        }
      }

      if (msg.type === 'approvals.changed') {
        const taskId = msg.payload?.taskId as string | null | undefined;
        // Dashboard
        opts.qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
        // Task drawer
        if (taskId) opts.qc.invalidateQueries({ queryKey: ['approvals', 'task', taskId] });
        // Fallback
        opts.qc.invalidateQueries({ queryKey: ['approvals'] });
      }

      if (msg.type === 'runs.changed') {
        const taskId = msg.payload?.taskId as string | null | undefined;
        // Dashboard
        opts.qc.invalidateQueries({ queryKey: ['runs', 'stuck'] });
        opts.qc.invalidateQueries({ queryKey: ['runs', 'failed'] });
        // Task drawer
        if (taskId) opts.qc.invalidateQueries({ queryKey: ['runs', taskId] });
        // Fallback
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
