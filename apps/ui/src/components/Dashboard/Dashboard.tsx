import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approveApproval,
  listApprovals,
  listProjects,
  listRuns,
  listSections,
  listTasks,
  rejectApproval,
} from '../../api/queries';
import type { AgentRunListItem, Approval, Task, TaskStatus } from '../../api/types';
import { statusLabel } from '../Tasks/status';

import { InlineAlert } from '../ui/InlineAlert';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { PageHeader } from '../Layout/PageHeader';
import { Input } from '../ui/Input';

function withinLastHours(iso: string, hours: number) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= Date.now() - hours * 60 * 60 * 1000;
}

export function Dashboard({
  projectId,
  onSelectProject,
  onSelectTask,
  onQuickCapture,
}: {
  projectId: string | null;
  onSelectProject: (projectId: string) => void;
  onSelectTask: (input: { projectId: string; sectionId: string; taskId: string }) => void;
  onQuickCapture: (title: string) => Promise<void> | void;
}) {
  const [capture, setCapture] = useState('');

  const projectsQ = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const sectionsQ = useQuery({
    queryKey: ['sections', projectId, 'dashboard'],
    queryFn: () => {
      if (!projectId) return Promise.resolve([] as any[]);
      return listSections(projectId);
    },
    enabled: !!projectId,
  });

  const stuckQ = useQuery({
    queryKey: ['runs', 'stuck', projectId],
    queryFn: () => listRuns({ status: 'running', stuckMinutes: 10, projectId: projectId ?? undefined }),
  });

  const failedQ = useQuery({
    queryKey: ['runs', 'failed', projectId],
    queryFn: () => listRuns({ status: 'failed', projectId: projectId ?? undefined }),
  });

  const approvalsQ = useQuery({
    queryKey: ['approvals', 'pending', projectId],
    queryFn: () => listApprovals({ status: 'pending', projectId: projectId ?? undefined }),
  });

  const projectTasksQ = useQuery({
    queryKey: ['tasks', projectId, 'dashboard'],
    queryFn: () => {
      if (!projectId) return Promise.resolve([] as Task[]);
      return listTasks({ projectId });
    },
    enabled: !!projectId,
  });

  const qc = useQueryClient();

  const approveM = useMutation({
    mutationFn: async (id: string) => approveApproval(id, { decidedBy: 'ui' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
    },
  });

  const rejectM = useMutation({
    mutationFn: async (id: string) => rejectApproval(id, { decidedBy: 'ui' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
    },
  });

  const failedLast24h = useMemo(() => {
    const all = failedQ.data ?? [];
    return all.filter((r) => withinLastHours(r.created_at, 24));
  }, [failedQ.data]);

  const projectTasks = projectTasksQ.data ?? [];
  const statusOrder: TaskStatus[] = ['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived'];
  const statusCounts = useMemo(() => {
    const out: Record<TaskStatus, number> = {
      ideas: 0,
      todo: 0,
      doing: 0,
      review: 0,
      release: 0,
      done: 0,
      archived: 0,
    };
    for (const t of projectTasks) out[t.status] = (out[t.status] ?? 0) + 1;
    return out;
  }, [projectTasks]);

  const recentTasks = useMemo(() => {
    return [...projectTasks]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, 8);
  }, [projectTasks]);

  const sectionCount = sectionsQ.data?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Project Overview"
        subtitle="KPI, approvals, run health, and fast capture inbox."
        actions={
          <div className="flex min-w-[320px] flex-col gap-2">
            <label className="block text-xs uppercase tracking-wide text-muted-foreground">Project</label>
            <select
              className="h-9 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground"
              value={projectId ?? ''}
              onChange={(e) => onSelectProject(e.target.value)}
              disabled={!projectsQ.data?.length}
            >
              {(projectsQ.data ?? []).length === 0 ? (
                <option value="">No projects</option>
              ) : (
                (projectsQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
            <div className="flex gap-2">
              <Input value={capture} onChange={(e) => setCapture(e.target.value)} placeholder="Quick capture to inbox…" />
              <Button
                onClick={async () => {
                  const title = capture.trim();
                  if (!title) return;
                  await onQuickCapture(title);
                  setCapture('');
                }}
                disabled={!capture.trim() || !projectId}
              >
                Capture
              </Button>
            </div>
          </div>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Sections" subtitle="Current project structure">
          {sectionsQ.isLoading ? (
            <div className="p-3"><Skeleton className="h-16 w-full" /></div>
          ) : sectionsQ.isError ? (
            <div className="p-3"><InlineAlert>{String(sectionsQ.error)}</InlineAlert></div>
          ) : (
            <div className="p-3 text-sm text-muted-foreground">
              {sectionCount} sections configured.
            </div>
          )}
        </Panel>

        <Panel title="Stuck runs" subtitle="running ≥ 10 minutes">
          <RunList
            q={stuckQ}
            runs={stuckQ.data ?? []}
            emptyLabel="No stuck runs."
            onClick={(r) => {
              if (!r.task_id || !r.section_id || !projectId) return;
              onSelectTask({ projectId, sectionId: r.section_id, taskId: r.task_id });
            }}
          />
        </Panel>

        <Panel title="Failed runs" subtitle="last 24 hours">
          <RunList
            q={failedQ}
            runs={failedLast24h}
            emptyLabel="No failed runs in the last 24h."
            onClick={(r) => {
              if (!r.task_id || !r.section_id || !projectId) return;
              onSelectTask({ projectId, sectionId: r.section_id, taskId: r.task_id });
            }}
          />
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Project status" subtitle={projectId ? 'Counts by status' : 'Select a project'}>
          {projectTasksQ.isLoading ? (
            <div className="p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-14 w-full" />
                ))}
              </div>
            </div>
          ) : projectTasksQ.isError ? (
            <div className="p-3">
              <InlineAlert>{String(projectTasksQ.error)}</InlineAlert>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4">
              {statusOrder.map((s) => (
                <StatPill key={s} label={statusLabel(s)} value={statusCounts[s]} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent tasks" subtitle={projectId ? 'Latest updates' : 'Select a project'}>
          {projectTasksQ.isLoading ? (
            <div className="p-3">
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <TaskList
              tasks={recentTasks}
              onClick={(t) => {
                if (!projectId) return;
                onSelectTask({ projectId, sectionId: t.section_id ?? t.board_id, taskId: t.id });
              }}
            />
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Pending approvals" subtitle="need attention">
          <ApprovalList
            q={approvalsQ}
            approvals={approvalsQ.data ?? []}
            emptyLabel="No pending approvals."
            deciding={approveM.isPending || rejectM.isPending}
            onApprove={(a) => approveM.mutate(a.id)}
            onReject={(a) => rejectM.mutate(a.id)}
            onClick={(a) => {
              if (!a.task_id || !a.section_id || !projectId) return;
              onSelectTask({ projectId, sectionId: a.section_id, taskId: a.task_id });
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-1">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-2">{children}</CardContent>
    </Card>
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
        'w-full rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2 text-left transition ' +
        (disabled ? 'opacity-50' : 'hover:bg-surface-2/70')
      }
    >
      <div className="truncate text-sm text-foreground">{title}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function TaskList({ tasks, onClick }: { tasks: Task[]; onClick: (t: Task) => void }) {
  if (!tasks.length) return <div className="p-3 text-sm text-muted-foreground">No recent tasks.</div>;
  return (
    <div className="flex flex-col gap-2 p-2">
      {tasks.map((t) => (
        <RowButton
          key={t.id}
          title={t.title}
          subtitle={`${statusLabel(t.status)} • ${new Date(t.updated_at).toLocaleString()}`}
          onClick={() => onClick(t)}
        />
      ))}
    </div>
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
          disabled={!r.task_id || !r.section_id}
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
  deciding,
  onApprove,
  onReject,
  onClick,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown };
  approvals: Approval[];
  emptyLabel: string;
  deciding: boolean;
  onApprove: (a: Approval) => void;
  onReject: (a: Approval) => void;
  onClick: (a: Approval) => void;
}) {
  if (q.isLoading) return <div className="p-3"><Spinner label="Loading…" /></div>;
  if (q.isError) return <div className="p-3"><InlineAlert>{String(q.error)}</InlineAlert></div>;
  if (!approvals.length) return <div className="p-3 text-sm text-muted-foreground">{emptyLabel}</div>;

  return (
    <div className="flex flex-col gap-2 p-2">
      {approvals.slice(0, 20).map((a) => {
        const disabled = !a.task_id || !a.section_id;
        return (
          <div key={a.id} className="flex items-stretch gap-2">
            <RowButton
              title={a.request_title ?? a.task_title ?? a.task_id ?? a.id}
              subtitle={`pending • ${new Date(a.requested_at).toLocaleString()}`}
              disabled={disabled}
              onClick={() => onClick(a)}
            />
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || deciding}
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(a);
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={disabled || deciding}
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(a);
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
