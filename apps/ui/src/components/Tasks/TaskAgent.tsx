import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../ui/Badge';
import { StatusDot } from '../ui/StatusDot';
import { listAgents, getTaskSession, upsertTaskSession } from '../../api/queries';
import type { Agent, TaskSession } from '../../api/types';

export function TaskAgent({ taskId, lastRunStatus }: { taskId: string; lastRunStatus: string | null }) {
  const qc = useQueryClient();

  const agentsQ = useQuery({ queryKey: ['agents'], queryFn: listAgents });
  const sessionQ = useQuery({
    queryKey: ['task-session', taskId],
    queryFn: () => getTaskSession(taskId),
    enabled: !!taskId,
    retry: false,
  });

  const upsertM = useMutation({
    mutationFn: async (agentId: string | null) => upsertTaskSession(taskId, { agentId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task-session', taskId] });
    },
  });

  const agents = (agentsQ.data ?? []).filter((a) => a.enabled);
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

  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Agent</div>
      <div className="mt-3 grid gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Assigned agent</label>
          <select
            className="mt-1 w-full rounded-md border border-input/70 bg-surface-1/70 px-3 py-2 text-sm text-foreground"
            value={selectedAgentId}
            onChange={(e) => upsertM.mutate(e.target.value || null)}
            disabled={agentsQ.isLoading || upsertM.isPending}
          >
            <option value="">Auto (recommended)</option>
            {agents.map((agent: Agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.display_name}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-muted-foreground">
            Auto selects a default agent based on the task description. You can override before running.
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot tone={tone} />
          <span>Last run</span>
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
