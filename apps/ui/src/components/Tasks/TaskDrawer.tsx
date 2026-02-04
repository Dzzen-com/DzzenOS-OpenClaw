import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Approval, AgentRun, Task, TaskStatus } from '../../api/types';
import { listApprovals, listTaskRuns, patchTask, requestTaskApproval, simulateRun } from '../../api/queries';
import { statusLabel } from './status';
import { shortId } from './taskId';
import { formatUpdatedAt } from './taskTime';
import { InlineAlert } from '../ui/InlineAlert';
import { Button } from '../ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { TaskChat } from './TaskChat';

const STATUS: TaskStatus[] = ['todo', 'doing', 'blocked', 'done'];

type TabKey = 'details' | 'runs' | 'approvals' | 'chat';

export function TaskDrawer({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('details');

  const patchM = useMutation({
    mutationFn: async (vars: { id: string; status: TaskStatus }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
    },
  });

  const runsQ = useQuery({
    queryKey: ['runs', task?.id],
    queryFn: () => listTaskRuns(task!.id),
    enabled: open && !!task?.id,
    refetchInterval: (q) => {
      const data = q.state.data as any[] | undefined;
      const running = (data ?? []).some((r) => r.status === 'running');
      return running ? 500 : false;
    },
  });

  const approvalsQ = useQuery({
    queryKey: ['approvals', 'task', task?.id],
    queryFn: () => listApprovals(),
    enabled: open && !!task?.id,
  });

  const approvalsForTask: Approval[] = useMemo(() => {
    if (!task?.id) return [];
    const all = approvalsQ.data ?? [];
    return all.filter((a) => a.task_id === task.id).slice(0, 50);
  }, [approvalsQ.data, task?.id]);

  const simulateM = useMutation({
    mutationFn: async (id: string) => simulateRun(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['runs', task?.id] });
    },
  });

  const requestApprovalM = useMutation({
    mutationFn: async () => requestTaskApproval(task!.id, { title: `Approve task: ${task!.title}` }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      await qc.invalidateQueries({ queryKey: ['approvals', 'task', task?.id] });
    },
  });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setTab('details');
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 h-dvh w-full max-w-xl border-l border-border/70 bg-card p-6 shadow-popover outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold tracking-tight">
                {task ? `${shortId(task.id)} · ${task.title}` : 'Task'}
              </Dialog.Title>
              <div className="mt-1 text-sm text-muted-foreground">Local task</div>
            </div>
            <Dialog.Close asChild aria-label="Close">
              <Button variant="secondary">Close</Button>
            </Dialog.Close>
          </div>

          {patchM.isError ? (
            <div className="mt-4">
              <InlineAlert>{String(patchM.error)}</InlineAlert>
            </div>
          ) : null}

          <div className="mt-5">
            <Tabs defaultValue="details" value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="runs">Runs</TabsTrigger>
                <TabsTrigger value="approvals">Approvals</TabsTrigger>
                <TabsTrigger value="chat">Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="details">
                <div className="grid gap-3">
                  <Row label="Status">
                    <select
                      value={task?.status ?? 'todo'}
                      disabled={!task || patchM.isPending}
                      onChange={(e) => {
                        if (!task) return;
                        patchM.mutate({ id: task.id, status: e.target.value as TaskStatus });
                      }}
                      className="h-9 rounded-md border border-input bg-background/40 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {STATUS.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </Row>

                  <Row label="Updated">
                    <div className="text-sm text-foreground">{task ? formatUpdatedAt(task.updated_at) : '—'}</div>
                  </Row>

                  <Row label="Created">
                    <div className="text-sm text-foreground">{task ? formatUpdatedAt(task.created_at) : '—'}</div>
                  </Row>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</div>
                    <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
                      {task?.description?.trim() ? task.description : '—'}
                    </p>
                  </div>

                  <div className="text-xs text-muted-foreground">PATCH /tasks/:id (status)</div>
                </div>
              </TabsContent>

              <TabsContent value="runs">
                <RunsPanel
                  taskId={task?.id ?? null}
                  runs={runsQ.data ?? []}
                  isLoading={runsQ.isLoading}
                  error={runsQ.isError ? runsQ.error : null}
                  simulatePending={simulateM.isPending}
                  onSimulate={() => {
                    if (!task) return;
                    simulateM.mutate(task.id);
                  }}
                />
              </TabsContent>

              <TabsContent value="approvals">
                <ApprovalsPanel
                  taskId={task?.id ?? null}
                  approvals={approvalsForTask}
                  isLoading={approvalsQ.isLoading}
                  error={approvalsQ.isError ? approvalsQ.error : null}
                  requestPending={requestApprovalM.isPending}
                  onRequest={() => {
                    if (!task) return;
                    requestApprovalM.mutate();
                  }}
                />
              </TabsContent>

              <TabsContent value="chat">
                {task?.id ? <TaskChat taskId={task.id} taskTitle={task.title} /> : null}
                {!task?.id ? <div className="text-sm text-muted-foreground">Open a task to chat.</div> : null}
              </TabsContent>
            </Tabs>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RunsPanel({
  taskId,
  runs,
  isLoading,
  error,
  simulatePending,
  onSimulate,
}: {
  taskId: string | null;
  runs: AgentRun[];
  isLoading: boolean;
  error: unknown;
  simulatePending: boolean;
  onSimulate: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Runs</div>
        <Button size="sm" variant="secondary" disabled={!taskId || simulatePending} onClick={onSimulate}>
          Simulate run (stub)
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="mt-3">
          <InlineAlert>{String(error)}</InlineAlert>
        </div>
      ) : runs.length ? (
        <div className="mt-3 grid gap-2">
          {runs.slice(0, 30).map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate">
                  {r.agent_name ?? 'Agent run'} • <span className="text-muted-foreground">{r.status}</span>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">{r.id.slice(0, 8)}</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()} • {r.steps?.length ?? 0} steps
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">No runs for this task.</div>
      )}
    </div>
  );
}

function ApprovalsPanel({
  taskId,
  approvals,
  isLoading,
  error,
  requestPending,
  onRequest,
}: {
  taskId: string | null;
  approvals: Approval[];
  isLoading: boolean;
  error: unknown;
  requestPending: boolean;
  onRequest: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Approvals</div>
        <Button size="sm" variant="secondary" disabled={!taskId || requestPending} onClick={onRequest}>
          Request approval (stub)
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="mt-3">
          <InlineAlert>{String(error)}</InlineAlert>
        </div>
      ) : approvals.length ? (
        <div className="mt-3 grid gap-2">
          {approvals.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-foreground">{a.request_title ?? `Approval ${a.id.slice(0, 8)}`}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {a.status} • {new Date(a.requested_at).toLocaleString()}
                </div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">{a.id.slice(0, 8)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">No approvals for this task.</div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
