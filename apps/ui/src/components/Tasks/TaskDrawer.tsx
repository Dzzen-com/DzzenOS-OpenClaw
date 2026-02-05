import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Approval, AgentRun, Task, TaskStatus } from '../../api/types';
import { listApprovals, listTaskRuns, patchTask, requestTaskApproval, stopTask } from '../../api/queries';
import { runTask } from '../../api/queries';
import { statusLabel } from './status';
import { shortId } from './taskId';
import { formatElapsed, formatUpdatedAt } from './taskTime';
import { InlineAlert } from '../ui/InlineAlert';
import { Button } from '../ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { TaskChat } from './TaskChat';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { StatusDot } from '../ui/StatusDot';
import { Input } from '../ui/Input';
import { Checklist } from './Checklist';
import { TaskAgent } from './TaskAgent';

const STATUS: TaskStatus[] = ['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived'];

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
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [stopConfirm, setStopConfirm] = useState(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const patchM = useMutation({
    mutationFn: async (vars: { id: string; status: TaskStatus }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
    },
  });

  const updateM = useMutation({
    mutationFn: async (vars: { id: string; title?: string; description?: string | null }) =>
      patchTask(vars.id, { title: vars.title, description: vars.description }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
    },
  });

  const planM = useMutation({
    mutationFn: async (id: string) => runTask(id, { mode: 'plan' }),
    onSuccess: async () => {
      if (task?.board_id) await qc.invalidateQueries({ queryKey: ['tasks', task.board_id] });
      if (task?.id) await qc.invalidateQueries({ queryKey: ['checklist', task.id] });
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

  useEffect(() => {
    setTitleDraft(task?.title ?? '');
    setDescDraft(task?.description ?? '');
  }, [task?.id]);

  const simulateM = useMutation({
    mutationFn: async (id: string) => runTask(id, { mode: 'execute' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['runs', task?.id] });
    },
  });

  const stopM = useMutation({
    mutationFn: async (id: string) => stopTask(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['runs', task?.id] });
      if (task?.board_id) await qc.invalidateQueries({ queryKey: ['tasks', task.board_id] });
    },
  });

  const requestApprovalM = useMutation({
    mutationFn: async () => requestTaskApproval(task!.id, { title: `Approve task: ${task!.title}` }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
      await qc.invalidateQueries({ queryKey: ['approvals', 'task', task?.id] });
    },
  });

  const activeRun = useMemo(() => {
    const runs = runsQ.data ?? [];
    return runs.find((r) => r.status === 'running') ?? runs[0] ?? null;
  }, [runsQ.data]);
  const activeStage = getRunStage(activeRun) ?? task?.run_step_kind ?? null;
  const activeStageLabel = stageLabel(activeStage);
  const runStatus = activeRun?.status ?? task?.run_status ?? null;
  const runStartedAt = activeRun?.started_at ?? task?.run_started_at ?? null;
  const elapsed = runStatus === 'running' ? formatElapsed(runStartedAt) : null;
  const recentActivity = useMemo(() => {
    const steps = activeRun?.steps ?? [];
    return steps.slice(-3).reverse();
  }, [activeRun?.steps]);
  const inputTokens = activeRun?.input_tokens ?? null;
  const outputTokens = activeRun?.output_tokens ?? null;
  const totalTokens = activeRun?.total_tokens ?? null;
  const tokenLabel = formatTokenLabel({ inputTokens, outputTokens, totalTokens });
  const showTokenLabel = useMemo(() => {
    if (!tokenLabel) return false;
    if (activeRun?.status === 'running') return true;
    const finishedAt = activeRun?.finished_at ? Date.parse(activeRun.finished_at) : null;
    if (finishedAt && Number.isFinite(finishedAt)) {
      const ageMs = Date.now() - finishedAt;
      return ageMs <= 30 * 60 * 1000;
    }
    return true;
  }, [tokenLabel, activeRun?.status, activeRun?.finished_at]);

  useEffect(() => {
    if (runStatus !== 'running') {
      setStopConfirm(false);
      if (stopTimer.current) {
        clearTimeout(stopTimer.current);
        stopTimer.current = null;
      }
    }
  }, [runStatus]);

  useEffect(() => {
    if (!open || runStatus !== 'running') return;
    const handler = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      if (e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (stopConfirm) {
        if (task?.id) stopM.mutate(task.id);
        return;
      }
      setStopConfirm(true);
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => setStopConfirm(false), 6000);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, runStatus, stopConfirm, task?.id, stopM]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setTab('details');
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-[60] h-dvh w-full max-w-xl border-0 bg-surface-1/85 p-4 shadow-popover backdrop-blur outline-none sm:border-l sm:border-border/70 sm:p-6"
          aria-describedby={undefined}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            touchStartX.current = t.clientX;
            touchStartY.current = t.clientY;
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            const startX = touchStartX.current;
            const startY = touchStartY.current;
            if (startX == null || startY == null) return;
            const dx = t.clientX - startX;
            const dy = Math.abs(t.clientY - startY);
            if (dx > 80 && dy < 50) {
              onOpenChange(false);
              touchStartX.current = null;
              touchStartY.current = null;
            }
          }}
          onTouchEnd={() => {
            touchStartX.current = null;
            touchStartY.current = null;
          }}
        >
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold tracking-tight">
                {task ? `${shortId(task.id)} · ${task.title}` : 'Task'}
              </Dialog.Title>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusDot
                  tone={
                    task?.status === 'done'
                      ? 'success'
                      : task?.status === 'doing'
                        ? 'info'
                        : task?.status === 'review' || task?.status === 'release'
                          ? 'warning'
                          : task?.status === 'archived'
                            ? 'muted'
                            : 'muted'
                  }
                />
                <span>Local task</span>
                {task ? (
                  <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
                    {statusLabel(task.status)}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={!task || planM.isPending}
                onClick={() => task && planM.mutate(task.id)}
              >
                {planM.isPending ? 'Planning…' : 'Plan'}
              </Button>
              <Dialog.Close asChild aria-label="Close">
                <Button variant="ghost">Close</Button>
              </Dialog.Close>
            </div>
          </div>

          {(patchM.isError || updateM.isError || planM.isError) ? (
            <div className="mt-4">
              <InlineAlert>{String(patchM.error ?? updateM.error ?? planM.error)}</InlineAlert>
            </div>
          ) : null}

          <div className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle>Agent status</CardTitle>
                <div className="flex items-center gap-2">
                  {stopConfirm ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!task?.id || runStatus !== 'running' || stopM.isPending}
                        onClick={() => task?.id && stopM.mutate(task.id)}
                      >
                        {stopM.isPending ? 'Stopping…' : 'Confirm stop'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setStopConfirm(false);
                          if (stopTimer.current) {
                            clearTimeout(stopTimer.current);
                            stopTimer.current = null;
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!task?.id || runStatus !== 'running' || stopM.isPending}
                      onClick={() => {
                        setStopConfirm(true);
                        if (stopTimer.current) clearTimeout(stopTimer.current);
                        stopTimer.current = setTimeout(() => setStopConfirm(false), 6000);
                      }}
                    >
                      {stopM.isPending ? 'Stopping…' : 'Stop'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-3 text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={runTone(runStatus)} pulse={runStatus === 'running'} />
                    <span>{runStatusLabel(runStatus)}</span>
                  </div>
                  {elapsed ? <span className="text-muted-foreground">• {elapsed}</span> : null}
                  {activeStageLabel ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface-2/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-info/80 shadow-[0_0_6px_hsl(var(--info)/0.6)]" />
                      {activeStageLabel}
                    </span>
                  ) : null}
                  {tokenLabel && showTokenLabel ? <span className="text-muted-foreground">• {tokenLabel}</span> : null}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1">
                  {['plan', 'execute', 'report'].map((step, idx) => {
                    const state = stageState(step, activeRun);
                    const isActive = runStatus === 'running' && activeStage === step;
                    const base =
                      state === 'done'
                        ? 'bg-success/70'
                        : state === 'failed'
                          ? 'bg-danger/70'
                          : isActive
                            ? 'bg-gradient-to-r from-info/80 via-primary/70 to-accent/70 shadow-inner'
                            : 'bg-border/70';
                    return (
                      <div
                        key={step}
                        className={`h-2 rounded-full ${base} ${isActive ? 'animate-pulse' : ''}`}
                        aria-label={`Step ${idx + 1}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 grid grid-cols-3 text-[11px] text-muted-foreground">
                  <span>Plan</span>
                  <span className="text-center">Execute</span>
                  <span className="text-right">Report</span>
                </div>

                <div className="mt-3 rounded-lg border border-border/70 bg-surface-1/60 px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Latest activity
                  </div>
                  {recentActivity.length ? (
                    <div className="mt-2 grid gap-1 text-xs text-foreground">
                      {recentActivity.map((step) => (
                        <div key={step.id} className="flex items-center justify-between gap-3">
                          <span className="truncate">{stageLabel(step.kind) ?? step.kind}</span>
                          <span className="text-muted-foreground">{step.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-muted-foreground">No activity yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-5">
            <Tabs defaultValue="details" value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList className="w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="details" className="text-[11px] sm:text-xs">
                  Details
                </TabsTrigger>
                <TabsTrigger value="runs" className="text-[11px] sm:text-xs">
                  Runs
                </TabsTrigger>
                <TabsTrigger value="approvals" className="text-[11px] sm:text-xs">
                  Approvals
                </TabsTrigger>
                <TabsTrigger value="chat" className="text-[11px] sm:text-xs">
                  Chat
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details">
                <div className="grid gap-3">
                  <Row label="Title">
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      placeholder="Task title"
                    />
                  </Row>

                  <Row label="Status">
                    <select
                      value={task?.status ?? 'todo'}
                      disabled={!task || patchM.isPending || updateM.isPending}
                      onChange={(e) => {
                        if (!task) return;
                        patchM.mutate({ id: task.id, status: e.target.value as TaskStatus });
                      }}
                      className="h-9 rounded-md border border-input/70 bg-surface-1/70 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

                  {task?.id ? (
                    <TaskAgent taskId={task.id} lastRunStatus={runsQ.data?.[0]?.status ?? null} />
                  ) : null}

                  {task?.id ? <Checklist taskId={task.id} /> : null}

                  <Card>
                    <CardHeader>
                      <CardTitle>Description</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      <textarea
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        placeholder="Describe the task…"
                        rows={4}
                        className="w-full resize-none rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Editable by humans or agents (when API is wired).
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!task || updateM.isPending}
                          onClick={() => {
                            if (!task) return;
                            updateM.mutate({
                              id: task.id,
                              title: titleDraft.trim() || task.title,
                              description: descDraft.trim() ? descDraft : null,
                            });
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="text-xs text-muted-foreground">PATCH /tasks/:id</div>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Runs</CardTitle>
        <Button size="sm" variant="secondary" disabled={!taskId || simulatePending} onClick={onSimulate}>
          Run now
        </Button>
      </CardHeader>
      <CardContent className="pt-0">

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
              className="rounded-lg border border-border/70 bg-surface-1/60 px-3 py-2 text-sm text-foreground"
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
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Approvals</CardTitle>
        <Button size="sm" variant="secondary" disabled={!taskId || requestPending} onClick={onRequest}>
          Request approval (stub)
        </Button>
      </CardHeader>
      <CardContent className="pt-0">

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
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface-1/60 px-3 py-2"
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
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-surface-2/40 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function stageLabel(kind?: string | null) {
  if (!kind) return null;
  if (kind === 'plan') return 'Planning';
  if (kind === 'execute') return 'Executing';
  if (kind === 'report') return 'Reporting';
  return kind;
}

function getRunStage(run?: AgentRun | null) {
  if (!run?.steps?.length) return null;
  const running = run.steps.find((s) => s.status === 'running');
  if (running?.kind) return running.kind;
  return run.steps[run.steps.length - 1]?.kind ?? null;
}

function stageState(step: string, run?: AgentRun | null): 'idle' | 'running' | 'done' | 'failed' {
  if (!run?.steps?.length) return 'idle';
  const steps = run.steps.filter((s) => s.kind === step);
  if (!steps.length) return 'idle';
  if (steps.some((s) => s.status === 'failed')) return 'failed';
  if (steps.some((s) => s.status === 'running')) return 'running';
  if (steps.some((s) => s.status === 'succeeded')) return 'done';
  return 'idle';
}

function runTone(status?: string | null) {
  if (status === 'running') return 'info';
  if (status === 'failed') return 'danger';
  if (status === 'succeeded') return 'success';
  if (status === 'cancelled') return 'muted';
  return 'muted';
}

function runStatusLabel(status?: string | null) {
  if (status === 'running') return 'Running';
  if (status === 'failed') return 'Failed';
  if (status === 'succeeded') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Idle';
}

function formatTokens(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  const n = Number(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatTokenLabel(input: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }) {
  const input = formatTokens(input.inputTokens);
  const output = formatTokens(input.outputTokens);
  const total = formatTokens(input.totalTokens);
  if (input || output) {
    return `${input ?? '—'} in / ${output ?? '—'} out`;
  }
  return total ? `${total} tokens` : null;
}
