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
        const projectId = msg.payload?.projectId as string | null | undefined;
        const sectionId = (msg.payload?.sectionId ?? msg.payload?.boardId) as string | null | undefined;
        const taskId = msg.payload?.taskId as string | null | undefined;
        if (projectId || sectionId) opts.qc.invalidateQueries({ queryKey: ['tasks'] });
        else opts.qc.invalidateQueries({ queryKey: ['tasks'] });
        opts.qc.invalidateQueries({ queryKey: ['projects-tree'] });
        if (taskId) {
          opts.qc.invalidateQueries({ queryKey: ['task-details', taskId] });
          opts.qc.invalidateQueries({ queryKey: ['execution-config', taskId] });
          opts.qc.invalidateQueries({ queryKey: ['context-items', taskId] });
        }
      }

      if (msg.type === 'projects.changed') {
        opts.qc.invalidateQueries({ queryKey: ['projects'] });
        opts.qc.invalidateQueries({ queryKey: ['projects-tree'] });
      }

      if (msg.type === 'sections.changed' || msg.type === 'boards.changed') {
        opts.qc.invalidateQueries({ queryKey: ['sections'] });
        opts.qc.invalidateQueries({ queryKey: ['boards'] });
        opts.qc.invalidateQueries({ queryKey: ['projects-tree'] });
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
        const sectionId = (msg.payload?.sectionId ?? msg.payload?.boardId) as string | null | undefined;
        opts.qc.invalidateQueries({ queryKey: ['docs', 'overview'] });
        if (sectionId) {
          opts.qc.invalidateQueries({ queryKey: ['docs', 'section', sectionId] });
          opts.qc.invalidateQueries({ queryKey: ['docs', 'board', sectionId] });
          opts.qc.invalidateQueries({ queryKey: ['docs', 'changelog', sectionId] });
        }
      }

      if (msg.type === 'memory.changed') {
        opts.qc.invalidateQueries({ queryKey: ['memory-scopes'] });
        opts.qc.invalidateQueries({ queryKey: ['memory-doc'] });
        opts.qc.invalidateQueries({ queryKey: ['memory-index-status'] });
        opts.qc.invalidateQueries({ queryKey: ['memory-models'] });
      }

      if (msg.type === 'agents.changed') {
        opts.qc.invalidateQueries({ queryKey: ['agents'] });
        opts.qc.invalidateQueries({ queryKey: ['marketplace-agents'] });
        opts.qc.invalidateQueries({ queryKey: ['agent-subagents'] });
        opts.qc.invalidateQueries({ queryKey: ['agent-orchestration-preview'] });
      }

      if (msg.type === 'skills.changed') {
        opts.qc.invalidateQueries({ queryKey: ['skills'] });
        opts.qc.invalidateQueries({ queryKey: ['marketplace-skills'] });
      }

      if (msg.type === 'models.changed') {
        opts.qc.invalidateQueries({ queryKey: ['models-overview'] });
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
