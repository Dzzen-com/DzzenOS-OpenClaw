import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../ui/Badge';
import { StatusDot } from '../ui/StatusDot';
import { Tooltip } from '../ui/Tooltip';
import { IconInfo } from '../ui/Icons';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { listAgents, getTaskSession, upsertTaskSession } from '../../api/queries';
import type { Agent, ReasoningLevel, TaskSession } from '../../api/types';
import { useTranslation } from 'react-i18next';

export function TaskAgent({
  taskId,
  boardId: _boardId,
  lastRunStatus,
  onOpenAgents,
}: {
  taskId: string;
  boardId?: string;
  lastRunStatus: string | null;
  onOpenAgents?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const agentsQ = useQuery({ queryKey: ['agents'], queryFn: () => listAgents() });
  const sessionQ = useQuery({
    queryKey: ['task-session', taskId],
    queryFn: () => getTaskSession(taskId),
    enabled: !!taskId,
    retry: false,
  });

  const upsertM = useMutation({
    mutationFn: async (input: { agentId?: string | null; reasoningLevel?: ReasoningLevel | null }) =>
      upsertTaskSession(taskId, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task-session', taskId] });
    },
  });

  const agents = (agentsQ.data ?? []).filter((a) => a.enabled);
  const hasAgents = agents.length > 0;
  const session = sessionQ.data as TaskSession | undefined;

  const tone =
    lastRunStatus === 'running'
      ? 'info'
      : lastRunStatus === 'failed'
        ? 'danger'
        : lastRunStatus === 'succeeded'
          ? 'success'
          : 'muted';

  const selectedAgentId = session?.agent_id ?? '';
  const autoSelected = !selectedAgentId;
  const reasoningLevel = (session?.reasoning_level ?? 'auto') as ReasoningLevel;

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Agent')}</div>
      <div className="mt-3 grid gap-3">
        {hasAgents ? (
          <div>
            <label className="text-xs text-muted-foreground">{t('Assigned agent')}</label>
            <select
              className="mt-1 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
              value={selectedAgentId}
              onChange={(e) => upsertM.mutate({ agentId: e.target.value || null })}
              disabled={agentsQ.isLoading || upsertM.isPending}
            >
              <option value="">{t('Auto (recommended)')}</option>
              {agents.map((agent: Agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.display_name}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-muted-foreground">
              {t('Auto selects a default agent based on the task description. You can override before running.')}
            </div>
            {autoSelected ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border/70 bg-surface-1/60 px-2 py-1 text-[11px] text-muted-foreground">
                {t('Auto agent selected')}
              </div>
            ) : null}
            <div className="mt-2 text-xs text-muted-foreground">
              {t('Skills, tools, and prompts are configured in the agent profile.')}
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <InlineAlert>{t('No agents enabled yet.')}</InlineAlert>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOpenAgents?.()} disabled={!onOpenAgents}>
                {t('Manage agents')}
              </Button>
              <div className="text-xs text-muted-foreground">
                {t('Create or enable an agent to assign it to tasks.')}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Skills, tools, and prompts are configured in the agent profile.')}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground">
            {t('Reasoning')}
            <Tooltip label={t('Reasoning enables deeper planning for complex tasks. Uses /think directive.')}>
              <span className="ml-2 inline-flex rounded-full border border-border/70 bg-surface-1/70 p-1 text-muted-foreground">
                <IconInfo className="h-3 w-3" />
              </span>
            </Tooltip>
          </label>
          <select
            className="mt-1 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
            value={reasoningLevel}
            onChange={(e) => upsertM.mutate({ reasoningLevel: e.target.value as ReasoningLevel })}
            disabled={upsertM.isPending}
          >
            <option value="auto">{t('Auto (recommended)')}</option>
            <option value="off">{t('Off')}</option>
            <option value="low">{t('Low')}</option>
            <option value="medium">{t('Medium')}</option>
            <option value="high">{t('High')}</option>
          </select>
          <div className="mt-2 text-xs text-muted-foreground">{t('Auto enables reasoning for longer, complex tasks.')}</div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot tone={tone} />
          <span>{t('Last run')}</span>
          {lastRunStatus ? (
            <Badge variant="outline" className="h-5 rounded-md px-2 text-[10px] uppercase tracking-wide">
              {lastRunStatus}
            </Badge>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
    </div>
  );
}
