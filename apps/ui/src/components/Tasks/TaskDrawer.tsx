import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Approval, AgentRun, Task, TaskStatus } from '../../api/types';
import {
  attachTaskAgent,
  createTaskContextItem,
  deleteTaskContextItem,
  getTaskExecutionConfig,
  listAgents,
  listApprovals,
  listTaskContextItems,
  listTaskRuns,
  patchTask,
  requestTaskApproval,
  runTask,
} from '../../api/queries';
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
  const [attachAgentId, setAttachAgentId] = useState<string>('');
  const [contextTitle, setContextTitle] = useState('');
  const [contextBody, setContextBody] = useState('');
  const [runBrief, setRunBrief] = useState('');

  const patchM = useMutation({
    mutationFn: async (vars: { id: string; status: TaskStatus }) => patchTask(vars.id, { status: vars.status }),
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['tasks', t.board_id] });
    },
  });

  const agentsQ = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents(),
    enabled: open,
  });

  const executionConfigQ = useQuery({
    queryKey: ['execution-config', task?.id],
    queryFn: () => getTaskExecutionConfig(task!.id),
    enabled: open && !!task?.id,
    retry: false,
  });

  const contextItemsQ = useQuery({
    queryKey: ['context-items', task?.id],
    queryFn: () => listTaskContextItems(task!.id),
    enabled: open && !!task?.id,
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

  const attachAgentM = useMutation({
    mutationFn: async (input: { taskId: string; agentId: string }) => attachTaskAgent(input.taskId, input.agentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks', task?.board_id] });
      await qc.invalidateQueries({ queryKey: ['execution-config', task?.id] });
      await qc.invalidateQueries({ queryKey: ['runs', task?.id] });
    },
  });

  const addContextM = useMutation({
    mutationFn: async (input: { taskId: string; title?: string; content: string }) =>
      createTaskContextItem(input.taskId, input),
    onSuccess: async () => {
      setContextTitle('');
      setContextBody('');
      await qc.invalidateQueries({ queryKey: ['context-items', task?.id] });
      await qc.invalidateQueries({ queryKey: ['tasks', task?.board_id] });
    },
  });

  const deleteContextM = useMutation({
    mutationFn: async (input: { taskId: string; itemId: string }) => deleteTaskContextItem(input.taskId, input.itemId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['context-items', task?.id] });
    },
  });

  const runTaskM = useMutation({
    mutationFn: async (input: { taskId: string; brief?: string }) => runTask(input.taskId, { brief: input.brief }),
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

  useEffect(() => {
    if (!task) {
      setAttachAgentId('');
      setRunBrief('');
      return;
    }
    setAttachAgentId(task.agent_id ?? '');
    setRunBrief(task.description ?? '');
  }, [task?.id, task?.agent_id, task?.description]);

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

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Attached Agent</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Execution settings are managed by the agent profile (agent-first, read-only in task card).
                    </div>

                    <div className="mt-3 flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label className="text-xs text-muted-foreground">Orchestrator profile</label>
                        <select
                          value={attachAgentId}
                          onChange={(e) => setAttachAgentId(e.target.value)}
                          disabled={!task || agentsQ.isLoading || attachAgentM.isPending}
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background/40 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <option value="">Select agent…</option>
                          {(agentsQ.data ?? [])
                            .filter((a) => a.enabled)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.display_name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!task || !attachAgentId || attachAgentId === task?.agent_id || attachAgentM.isPending}
                        onClick={() => {
                          if (!task || !attachAgentId) return;
                          attachAgentM.mutate({ taskId: task.id, agentId: attachAgentId });
                        }}
                      >
                        {attachAgentM.isPending ? 'Attaching…' : 'Attach'}
                      </Button>
                    </div>

                    {agentsQ.isError ? <div className="mt-2"><InlineAlert>{String(agentsQ.error)}</InlineAlert></div> : null}
                    {attachAgentM.isError ? <div className="mt-2"><InlineAlert>{String(attachAgentM.error)}</InlineAlert></div> : null}

                    <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground">
                      {executionConfigQ.isLoading ? (
                        'Loading execution config…'
                      ) : executionConfigQ.isError ? (
                        `No execution config yet: ${String((executionConfigQ.error as any)?.message ?? executionConfigQ.error)}`
                      ) : executionConfigQ.data ? (
                        <div className="grid gap-1">
                          <div>
                            Agent: <span className="text-foreground">{executionConfigQ.data.agent.display_name}</span>
                          </div>
                          <div>
                            Model: <span className="text-foreground">{executionConfigQ.data.resolved.model}</span>
                          </div>
                          <div>
                            Policy: <span className="text-foreground">{executionConfigQ.data.agent.policy_json ? 'configured' : 'default'}</span>
                          </div>
                          <div>
                            Tools: <span className="text-foreground">{executionConfigQ.data.agent.tools_json ? 'configured' : 'default'}</span>
                          </div>
                        </div>
                      ) : (
                        'Attach an enabled orchestrator agent to manage execution settings.'
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Context Pack</div>
                    <div className="mt-2 grid gap-2">
                      <input
                        value={contextTitle}
                        onChange={(e) => setContextTitle(e.target.value)}
                        placeholder="Optional title"
                        className="h-9 rounded-md border border-input bg-background/40 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      />
                      <textarea
                        value={contextBody}
                        onChange={(e) => setContextBody(e.target.value)}
                        placeholder="Add context notes/files summary for this task run..."
                        rows={3}
                        className="min-h-[84px] rounded-md border border-input bg-background/40 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!task || !contextBody.trim() || addContextM.isPending}
                          onClick={() => {
                            if (!task || !contextBody.trim()) return;
                            addContextM.mutate({ taskId: task.id, title: contextTitle.trim(), content: contextBody.trim() });
                          }}
                        >
                          {addContextM.isPending ? 'Adding…' : 'Add to Context Pack'}
                        </Button>
                      </div>
                    </div>
                    {addContextM.isError ? <div className="mt-2"><InlineAlert>{String(addContextM.error)}</InlineAlert></div> : null}
                    {deleteContextM.isError ? <div className="mt-2"><InlineAlert>{String(deleteContextM.error)}</InlineAlert></div> : null}

                    <div className="mt-3 grid gap-2">
                      {(contextItemsQ.data ?? []).length === 0 ? (
                        <div className="text-xs text-muted-foreground">No context items yet.</div>
                      ) : (
                        (contextItemsQ.data ?? []).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs text-foreground"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate font-medium">{item.title || 'Context item'}</div>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deleteContextM.isPending || !task}
                                onClick={() => task && deleteContextM.mutate({ taskId: task.id, itemId: item.id })}
                              >
                                Remove
                              </Button>
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.content}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="runs">
                <RunsPanel
                  taskId={task?.id ?? null}
                  runs={runsQ.data ?? []}
                  isLoading={runsQ.isLoading}
                  error={runsQ.isError ? runsQ.error : null}
                  runPending={runTaskM.isPending}
                  runDisabled={!task?.id || executionConfigQ.isError || !executionConfigQ.data}
                  runBrief={runBrief}
                  onRunBriefChange={setRunBrief}
                  onRun={() => {
                    if (!task) return;
                    runTaskM.mutate({ taskId: task.id, brief: runBrief.trim() || undefined });
                  }}
                />
                {runTaskM.isError ? <div className="mt-3"><InlineAlert>{String(runTaskM.error)}</InlineAlert></div> : null}
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
                {task?.id ? (
                  <TaskChat
                    taskId={task.id}
                    taskTitle={task.title}
                    agentOpenclawId={executionConfigQ.data?.agent.openclaw_agent_id}
                    model={executionConfigQ.data?.resolved.model}
                    disabled={!executionConfigQ.data}
                    disabledReason="Attach an enabled orchestrator agent first. Card chat is pre-run communication with that agent."
                  />
                ) : null}
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
  runPending,
  runDisabled,
  runBrief,
  onRunBriefChange,
  onRun,
}: {
  taskId: string | null;
  runs: AgentRun[];
  isLoading: boolean;
  error: unknown;
  runPending: boolean;
  runDisabled: boolean;
  runBrief: string;
  onRunBriefChange: (value: string) => void;
  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Runs</div>
      <div className="mt-3 grid gap-2 rounded-lg border border-border/70 bg-background/40 p-3">
        <div className="text-xs text-muted-foreground">Start run (agent-first snapshot)</div>
        <textarea
          value={runBrief}
          onChange={(e) => onRunBriefChange(e.target.value)}
          placeholder="Optional run brief..."
          rows={3}
          className="min-h-[84px] rounded-md border border-input bg-background/40 px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" disabled={!taskId || runDisabled || runPending} onClick={onRun}>
            {runPending ? 'Starting…' : 'Start Run'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="mt-3">
          <InlineAlert>{String(error)}</InlineAlert>
        </div>
      ) : runs.length ? (
        <div className="mt-3 grid gap-2">
          {runs.slice(0, 30).map((r) => {
            const snapshotModel = parseRunModel(r);
            return (
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
                {snapshotModel ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Model snapshot: <span className="text-foreground">{snapshotModel}</span>
                  </div>
                ) : null}
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} • {r.steps?.length ?? 0} steps
                </div>
              </div>
            );
          })}
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

function parseRunModel(run: AgentRun): string | null {
  if (!run.config_snapshot_json) return null;
  try {
    const parsed = JSON.parse(run.config_snapshot_json);
    const model =
      (typeof parsed?.resolved?.model === 'string' && parsed.resolved.model) ||
      (typeof parsed?.agent?.model === 'string' && parsed.agent.model) ||
      null;
    return model;
  } catch {
    return null;
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
