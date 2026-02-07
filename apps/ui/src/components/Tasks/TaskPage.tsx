import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { Approval, AgentRun, TaskStatus } from '../../api/types';
import {
  getTaskDetails,
  listApprovals,
  listTaskRuns,
  patchTask,
  requestTaskApproval,
  runTask,
  stopTask,
} from '../../api/queries';
import { PageHeader } from '../Layout/PageHeader';
import { InlineAlert } from '../ui/InlineAlert';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { statusLabel } from './status';
import { shortId } from './taskId';
import { formatElapsed, formatUpdatedAt } from './taskTime';
import { Checklist } from './Checklist';
import { TaskChat } from './TaskChat';
import { TaskAgent } from './TaskAgent';

const STATUSES: TaskStatus[] = ['ideas', 'todo', 'doing', 'review', 'release', 'done', 'archived'];

export function TaskPage({
  taskId,
  onBack,
  onOpenAgents,
}: {
  taskId: string;
  onBack: () => void;
  onOpenAgents?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'details' | 'runs' | 'approvals' | 'chat'>('details');

  const taskQ = useQuery({
    queryKey: ['task-details', taskId],
    queryFn: () => getTaskDetails(taskId),
    enabled: !!taskId,
  });
  const runsQ = useQuery({
    queryKey: ['runs', taskId],
    queryFn: () => listTaskRuns(taskId),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const data = q.state.data as AgentRun[] | undefined;
      return (data ?? []).some((r) => r.status === 'running') ? 700 : false;
    },
  });
  const approvalsQ = useQuery({
    queryKey: ['approvals', 'task', taskId],
    queryFn: () => listApprovals(),
    enabled: !!taskId,
  });

  const updateM = useMutation({
    mutationFn: async (patch: { title?: string; description?: string | null; status?: TaskStatus }) => patchTask(taskId, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task-details', taskId] });
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const runM = useMutation({
    mutationFn: async (mode: 'plan' | 'execute' | 'report') => runTask(taskId, { mode }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['runs', taskId] });
      await qc.invalidateQueries({ queryKey: ['task-details', taskId] });
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const stopM = useMutation({
    mutationFn: async () => stopTask(taskId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['runs', taskId] });
      await qc.invalidateQueries({ queryKey: ['task-details', taskId] });
      await qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const requestApprovalM = useMutation({
    mutationFn: async () => requestTaskApproval(taskId, { title: `Approve task: ${taskQ.data?.title ?? taskId}` }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approvals', 'task', taskId] });
      await qc.invalidateQueries({ queryKey: ['approvals', 'pending'] });
    },
  });

  const task = taskQ.data ?? null;
  const runs = runsQ.data ?? [];
  const activeRun = runs.find((r) => r.status === 'running') ?? runs[0] ?? null;
  const approvals = useMemo(() => {
    const all = approvalsQ.data ?? [];
    return all.filter((a) => a.task_id === taskId);
  }, [approvalsQ.data, taskId]);

  if (taskQ.isLoading) {
    return <div className="mx-auto w-full max-w-6xl p-6 text-sm text-muted-foreground">{t('Loading task…')}</div>;
  }

  if (taskQ.isError || !task) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <InlineAlert>{String(taskQ.error ?? t('Task not found'))}</InlineAlert>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={`${shortId(task.id)} · ${task.title}`}
        subtitle={`${statusLabel(task.status, t)} · ${t('Updated {{time}}', { time: formatUpdatedAt(task.updated_at) })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              {t('Back')}
            </Button>
            <select
              className="h-8 rounded-md border border-input/70 bg-surface-1/70 px-2 text-xs text-foreground"
              value={task.status}
              onChange={(e) => updateM.mutate({ status: e.target.value as TaskStatus })}
              disabled={updateM.isPending}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status, t)}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={() => runM.mutate('plan')} disabled={runM.isPending}>
              {t('Plan')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => runM.mutate('execute')} disabled={runM.isPending}>
              {t('Run')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => runM.mutate('report')} disabled={runM.isPending}>
              {t('Report')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => stopM.mutate()} disabled={stopM.isPending || activeRun?.status !== 'running'}>
              {stopM.isPending ? t('Stopping…') : t('Stop')}
            </Button>
          </div>
        }
      />

      {updateM.isError || runM.isError || stopM.isError || requestApprovalM.isError ? (
        <div className="mt-4">
          <InlineAlert>{String(updateM.error ?? runM.error ?? stopM.error ?? requestApprovalM.error)}</InlineAlert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('Brief')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <input
              className="rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm"
              value={task.title}
              onChange={(e) => updateM.mutate({ title: e.target.value })}
            />
            <textarea
              className="min-h-[120px] rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm"
              value={task.description ?? ''}
              onChange={(e) => updateM.mutate({ description: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('Run state')}</CardTitle>
            <Badge variant="outline">{activeRun?.status ?? 'idle'}</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <div>{t('Section')}: {task.section_name ?? task.section_id}</div>
            <div>{t('Last run')}: {activeRun ? `${activeRun.status} · ${formatElapsed(activeRun.started_at) ?? '—'}` : '—'}</div>
            <div>{t('Run ID')}: {activeRun?.id ? shortId(activeRun.id) : '—'}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs className="mt-4" defaultValue="details" value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="details">{t('Details')}</TabsTrigger>
          <TabsTrigger value="runs">{t('Runs')}</TabsTrigger>
          <TabsTrigger value="approvals">{t('Approvals')}</TabsTrigger>
          <TabsTrigger value="chat">{t('Chat')}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <div className="grid gap-4 lg:grid-cols-2">
            <Checklist taskId={task.id} />
            <TaskAgent taskId={task.id} lastRunStatus={activeRun?.status ?? null} onOpenAgents={onOpenAgents} />
          </div>
        </TabsContent>
        <TabsContent value="runs">
          <Card>
            <CardHeader><CardTitle>{t('Run history')}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {runs.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('No runs yet.')}</div>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-md border border-border/70 bg-surface-2/40 px-3 py-2 text-sm">
                    <div className="font-medium">{run.status.toUpperCase()} · {shortId(run.id)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="approvals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('Approvals')}</CardTitle>
              <Button size="sm" onClick={() => requestApprovalM.mutate()} disabled={requestApprovalM.isPending}>
                {requestApprovalM.isPending ? t('Requesting…') : t('Request approval')}
              </Button>
            </CardHeader>
            <CardContent className="grid gap-2">
              {approvals.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('No approvals yet.')}</div>
              ) : (
                approvals.map((approval: Approval) => (
                  <div key={approval.id} className="rounded-md border border-border/70 bg-surface-2/40 px-3 py-2 text-sm">
                    <div className="font-medium">{approval.request_title ?? approval.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {approval.status} · {new Date(approval.requested_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="chat">
          <TaskChat taskId={task.id} taskTitle={task.title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
