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
        if (boardId) opts.qc.invalidateQueries({ queryKey: ['tasks', boardId] });
        else opts.qc.invalidateQueries({ queryKey: ['tasks'] });
      }

      if (msg.type === 'boards.changed') {
        opts.qc.invalidateQueries({ queryKey: ['boards'] });
      }

      if (msg.type === 'task.checklist.changed') {
        const taskId = msg.payload?.taskId as string | null | undefined;
        if (taskId) opts.qc.invalidateQueries({ queryKey: ['checklist', taskId] });
      }

      if (msg.type === 'task.session.changed') {
        const taskId = msg.payload?.taskId as string | null | undefined;
        if (taskId) opts.qc.invalidateQueries({ queryKey: ['task-session', taskId] });
      }

      if (msg.type === 'task.chat.changed') {
        const taskId = msg.payload?.taskId as string | null | undefined;
        if (taskId) opts.qc.invalidateQueries({ queryKey: ['task-chat', taskId] });
      }

      if (msg.type === 'docs.changed') {
        const boardId = msg.payload?.boardId as string | null | undefined;
        opts.qc.invalidateQueries({ queryKey: ['docs', 'overview'] });
        if (boardId) {
          opts.qc.invalidateQueries({ queryKey: ['docs', 'board', boardId] });
          opts.qc.invalidateQueries({ queryKey: ['docs', 'changelog', boardId] });
        }
      }

      if (msg.type === 'agents.changed') {
        opts.qc.invalidateQueries({ queryKey: ['agents'] });
        opts.qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
      }

      if (msg.type === 'skills.changed') {
        opts.qc.invalidateQueries({ queryKey: ['skills'] });
        opts.qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
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
