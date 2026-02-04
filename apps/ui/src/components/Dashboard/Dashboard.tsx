import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listApprovals, listRuns } from '../../api/queries';
import type { AgentRunListItem, Approval } from '../../api/types';

import { InlineAlert } from '../ui/InlineAlert';
import { Spinner } from '../ui/Spinner';

function withinLastHours(iso: string, hours: number) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= Date.now() - hours * 60 * 60 * 1000;
}

export function Dashboard({
  onSelectTask,
}: {
  onSelectTask: (input: { boardId: string; taskId: string }) => void;
}) {
  const stuckQ = useQuery({
    queryKey: ['runs', 'stuck'],
    queryFn: () => listRuns({ status: 'running', stuckMinutes: 10 }),
  });

  const failedQ = useQuery({
    queryKey: ['runs', 'failed'],
    queryFn: () => listRuns({ status: 'failed' }),
  });

  const approvalsQ = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => listApprovals({ status: 'pending' }),
  });

  const failedLast24h = useMemo(() => {
    const all = failedQ.data ?? [];
    return all.filter((r) => withinLastHours(r.created_at, 24));
  }, [failedQ.data]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stuck runs, recent failures, and pending approvals.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Stuck runs" subtitle="running ≥ 10 minutes">
          <RunList
            q={stuckQ}
            runs={stuckQ.data ?? []}
            emptyLabel="No stuck runs."
            onClick={(r) => {
              if (!r.task_id || !r.board_id) return;
              onSelectTask({ boardId: r.board_id, taskId: r.task_id });
            }}
          />
        </Panel>

        <Panel title="Failed runs" subtitle="last 24 hours">
          <RunList
            q={failedQ}
            runs={failedLast24h}
            emptyLabel="No failed runs in the last 24h."
            onClick={(r) => {
              if (!r.task_id || !r.board_id) return;
              onSelectTask({ boardId: r.board_id, taskId: r.task_id });
            }}
          />
        </Panel>

        <Panel title="Pending approvals" subtitle="need attention">
          <ApprovalList
            q={approvalsQ}
            approvals={approvalsQ.data ?? []}
            emptyLabel="No pending approvals."
            onClick={(a) => {
              if (!a.task_id || !a.board_id) return;
              onSelectTask({ boardId: a.board_id, taskId: a.task_id });
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card shadow-panel">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function RowButton({
  title,
  subtitle,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        'w-full rounded-lg border border-border/70 px-3 py-2 text-left transition ' +
        (disabled ? 'opacity-50' : 'hover:bg-muted/30')
      }
    >
      <div className="truncate text-sm text-foreground">{title}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}

function RunList({
  q,
  runs,
  emptyLabel,
  onClick,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown };
  runs: AgentRunListItem[];
  emptyLabel: string;
  onClick: (r: AgentRunListItem) => void;
}) {
  if (q.isLoading) return <div className="p-3"><Spinner label="Loading…" /></div>;
  if (q.isError) return <div className="p-3"><InlineAlert>{String(q.error)}</InlineAlert></div>;
  if (!runs.length) return <div className="p-3 text-sm text-muted-foreground">{emptyLabel}</div>;

  return (
    <div className="flex flex-col gap-2 p-2">
      {runs.slice(0, 20).map((r) => (
        <RowButton
          key={r.id}
          title={r.task_title ?? r.task_id ?? r.id}
          subtitle={`${r.status} • run ${r.id.slice(0, 8)} • ${new Date(r.created_at).toLocaleString()}`}
          disabled={!r.task_id || !r.board_id}
          onClick={() => onClick(r)}
        />
      ))}
    </div>
  );
}

function ApprovalList({
  q,
  approvals,
  emptyLabel,
  onClick,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown };
  approvals: Approval[];
  emptyLabel: string;
  onClick: (a: Approval) => void;
}) {
  if (q.isLoading) return <div className="p-3"><Spinner label="Loading…" /></div>;
  if (q.isError) return <div className="p-3"><InlineAlert>{String(q.error)}</InlineAlert></div>;
  if (!approvals.length) return <div className="p-3 text-sm text-muted-foreground">{emptyLabel}</div>;

  return (
    <div className="flex flex-col gap-2 p-2">
      {approvals.slice(0, 20).map((a) => (
        <RowButton
          key={a.id}
          title={a.request_title ?? a.task_title ?? a.task_id ?? a.id}
          subtitle={`pending • ${new Date(a.requested_at).toLocaleString()}`}
          disabled={!a.task_id || !a.board_id}
          onClick={() => onClick(a)}
        />
      ))}
    </div>
  );
}
