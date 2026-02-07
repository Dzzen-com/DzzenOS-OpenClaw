import { apiFetch } from './client';
import type {
  AgentRun,
  AgentRunListItem,
  AgentRunStatus,
  Agent,
  MarketplaceAgent,
  InstalledSkill,
  MarketplaceSkill,
  SkillCapabilities,
  Approval,
  ApprovalStatus,
  Automation,
  Board,
  BoardAgentSettings,
  WorkspaceAgentSettings,
  AgentHeartbeatSettings,
  WorkspaceStandupSettings,
  OpenClawCronJobList,
  DocContent,
  Task,
  TaskChecklistItem,
  TaskMessage,
  TaskStatus,
  TaskSession,
} from './types';

type AgentScopeInput = {
  workspaceId?: string | null;
  boardId?: string | null;
};

function withAgentScope(path: string, scope?: AgentScopeInput): string {
  if (!scope?.workspaceId && !scope?.boardId) return path;
  const qs = new URLSearchParams();
  if (scope.workspaceId) qs.set('workspaceId', scope.workspaceId);
  if (scope.boardId) qs.set('boardId', scope.boardId);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function listBoards(): Promise<Board[]> {
  return apiFetch('/boards');
}

export function createBoard(input: {
  name: string;
  description?: string | null;
  position?: number;
  workspaceId?: string | null;
}): Promise<Board> {
  return apiFetch('/boards', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? null,
      position: input.position ?? 0,
      workspaceId: input.workspaceId ?? null,
    }),
  });
}

export function patchBoard(
  id: string,
  patch: { name?: string; description?: string | null; position?: number }
): Promise<Board> {
  return apiFetch(`/boards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteBoard(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/boards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getBoardAgentSettings(boardId: string): Promise<BoardAgentSettings> {
  return apiFetch(`/boards/${encodeURIComponent(boardId)}/agent-settings`);
}

export function upsertBoardAgentSettings(
  boardId: string,
  input: {
    preferred_agent_id?: string | null;
    skills?: string[];
    prompt_overrides?: Record<string, string | undefined>;
    policy?: Record<string, unknown>;
    memory_path?: string | null;
    auto_delegate?: boolean;
    sub_agents?: Array<{
      key: string;
      label?: string;
      agent_id?: string | null;
      openclaw_agent_id?: string | null;
      role_prompt?: string | null;
      model?: string | null;
      enabled?: boolean;
    }>;
  }
): Promise<BoardAgentSettings> {
  return apiFetch(`/boards/${encodeURIComponent(boardId)}/agent-settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function getWorkspaceAgentSettings(workspaceId: string): Promise<WorkspaceAgentSettings> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/agent-settings`);
}

export function upsertWorkspaceAgentSettings(
  workspaceId: string,
  input: {
    preferred_agent_id?: string | null;
    skills?: string[];
    prompt_overrides?: Record<string, string | undefined>;
    policy?: Record<string, unknown>;
    memory_path?: string | null;
    auto_delegate?: boolean;
    sub_agents?: Array<{
      key: string;
      label?: string;
      agent_id?: string | null;
      openclaw_agent_id?: string | null;
      role_prompt?: string | null;
      model?: string | null;
      enabled?: boolean;
    }>;
  }
): Promise<WorkspaceAgentSettings> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/agent-settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function listOpenClawCronJobs(input?: { all?: boolean }): Promise<OpenClawCronJobList> {
  const qs = new URLSearchParams();
  if (input?.all) qs.set('all', '1');
  const suf = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/openclaw/cron/jobs${suf}`);
}

export function getOpenClawCronStatus(): Promise<any> {
  return apiFetch('/openclaw/cron/status');
}

export function runOpenClawCronJob(jobId: string, input?: { mode?: 'force' | 'due' }): Promise<any> {
  return apiFetch(`/openclaw/cron/jobs/${encodeURIComponent(jobId)}/run`, {
    method: 'POST',
    body: JSON.stringify({ mode: input?.mode ?? 'force' }),
  });
}

export function listOpenClawCronRuns(jobId: string, input?: { limit?: number }): Promise<any> {
  const qs = new URLSearchParams();
  if (input?.limit != null) qs.set('limit', String(input.limit));
  const suf = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/openclaw/cron/jobs/${encodeURIComponent(jobId)}/runs${suf}`);
}

export function deleteOpenClawCronJob(jobId: string): Promise<any> {
  return apiFetch(`/openclaw/cron/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export function getAgentHeartbeatSettings(agentId: string): Promise<AgentHeartbeatSettings> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/heartbeat-settings`);
}

export function upsertAgentHeartbeatSettings(
  agentId: string,
  input: {
    enabled?: boolean;
    interval_minutes?: number;
    offset_minutes?: number;
    mode?: 'isolated' | 'main';
    message?: string;
    model?: string | null;
    sync?: boolean;
  }
): Promise<AgentHeartbeatSettings> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/heartbeat-settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function runAgentHeartbeatNow(agentId: string): Promise<{ run: unknown; settings: AgentHeartbeatSettings }> {
  return apiFetch(`/agents/${encodeURIComponent(agentId)}/heartbeat-run`, { method: 'POST' });
}

export function getWorkspaceStandupSettings(workspaceId: string): Promise<WorkspaceStandupSettings> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/standup-settings`);
}

export function upsertWorkspaceStandupSettings(
  workspaceId: string,
  input: {
    enabled?: boolean;
    time_utc?: string;
    prompt?: string | null;
    model?: string | null;
    sync?: boolean;
  }
): Promise<WorkspaceStandupSettings> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/standup-settings`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function runWorkspaceStandupNow(workspaceId: string): Promise<{ run: unknown; settings: WorkspaceStandupSettings }> {
  return apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/standup-run`, { method: 'POST' });
}

export function listTasks(boardId: string): Promise<Task[]> {
  const qs = new URLSearchParams({ boardId });
  return apiFetch(`/tasks?${qs.toString()}`);
}

export function createTask(input: { title: string; description?: string; boardId: string; status?: TaskStatus }): Promise<Task> {
  return apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? null,
      boardId: input.boardId,
      status: input.status,
    }),
  });
}

export function patchTask(
  id: string,
  patch: { status?: TaskStatus; title?: string; description?: string | null; position?: number }
): Promise<Task> {
  return apiFetch(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function reorderTasks(input: { boardId: string; orderedIds: string[] }): Promise<{ ok: boolean }> {
  return apiFetch('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function simulateRun(taskId: string): Promise<{ runId: string }> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/simulate-run`, { method: 'POST' });
}

export function runTask(taskId: string, input: { mode: 'plan' | 'execute' | 'report'; agentId?: string }): Promise<any> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/run`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function stopTask(taskId: string): Promise<{ ok: boolean; stopped: boolean; runId: string | null }> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/stop`, { method: 'POST' });
}

export function listTaskRuns(taskId: string): Promise<AgentRun[]> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/runs`);
}

export function getTaskSession(taskId: string): Promise<TaskSession> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/session`);
}

export function upsertTaskSession(
  taskId: string,
  input: { agentId?: string | null; reasoningLevel?: string | null }
): Promise<TaskSession> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/session`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listChecklist(taskId: string): Promise<TaskChecklistItem[]> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/checklist`);
}

export function createChecklistItem(taskId: string, input: { title: string; state?: string; position?: number }): Promise<TaskChecklistItem> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/checklist`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateChecklistItem(
  taskId: string,
  itemId: string,
  input: { title?: string; state?: string; position?: number }
): Promise<TaskChecklistItem> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteChecklistItem(taskId: string, itemId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
}

export function getTaskChat(taskId: string): Promise<TaskMessage[]> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/chat`);
}

export function sendTaskChat(
  taskId: string,
  input: { text: string; agentId?: string }
): Promise<{ reply: string }> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/chat`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listRuns(input?: { status?: AgentRunStatus; stuckMinutes?: number }): Promise<AgentRunListItem[]> {
  const qs = new URLSearchParams();
  if (input?.status) qs.set('status', input.status);
  if (input?.stuckMinutes != null) qs.set('stuckMinutes', String(input.stuckMinutes));
  const suf = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/runs${suf}`);
}

export function listApprovals(input?: { status?: ApprovalStatus }): Promise<Approval[]> {
  const qs = new URLSearchParams();
  if (input?.status) qs.set('status', input.status);
  const suf = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/approvals${suf}`);
}

export function approveApproval(id: string, input?: { decidedBy?: string; reason?: string }): Promise<Approval> {
  return apiFetch(`/approvals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ decidedBy: input?.decidedBy ?? null, reason: input?.reason ?? null }),
  });
}

export function rejectApproval(id: string, input?: { decidedBy?: string; reason?: string }): Promise<Approval> {
  return apiFetch(`/approvals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ decidedBy: input?.decidedBy ?? null, reason: input?.reason ?? null }),
  });
}

export function requestTaskApproval(
  taskId: string,
  input?: { title?: string; body?: string; stepId?: string }
): Promise<Approval> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/request-approval`, {
    method: 'POST',
    body: JSON.stringify({ title: input?.title ?? null, body: input?.body ?? null, stepId: input?.stepId ?? null }),
  });
}

// --- Automations ---

export function listAutomations(): Promise<Automation[]> {
  return apiFetch('/automations');
}

export function getAutomation(id: string): Promise<Automation> {
  return apiFetch(`/automations/${encodeURIComponent(id)}`);
}

export function createAutomation(input: { name: string; description?: string | null; graph: any }): Promise<Automation> {
  return apiFetch('/automations', {
    method: 'POST',
    body: JSON.stringify({ name: input.name, description: input.description ?? null, graph: input.graph }),
  });
}

export function updateAutomation(id: string, patch: { name?: string; description?: string | null; graph?: any }): Promise<Automation> {
  return apiFetch(`/automations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...patch, graph: patch.graph }),
  });
}

export function runAutomation(id: string): Promise<{ runId: string }> {
  return apiFetch(`/automations/${encodeURIComponent(id)}/run`, { method: 'POST' });
}

// --- Agents ---
export function listAgents(scope?: AgentScopeInput): Promise<Agent[]> {
  return apiFetch(withAgentScope('/agents', scope));
}

export function updateAgents(input: Agent[], scope?: AgentScopeInput): Promise<Agent[]> {
  return apiFetch(withAgentScope('/agents', scope), {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function createAgent(
  input: Pick<Agent, 'display_name' | 'openclaw_agent_id'> &
    Partial<
      Pick<
        Agent,
        | 'emoji'
        | 'enabled'
        | 'role'
        | 'description'
        | 'category'
        | 'tags'
        | 'skills'
        | 'prompt_overrides'
        | 'sort_order'
        | 'workspace_id'
      >
    >
): Promise<Agent> {
  return apiFetch('/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchAgent(
  id: string,
  patch: Partial<
    Pick<
      Agent,
      | 'display_name'
      | 'emoji'
      | 'openclaw_agent_id'
      | 'enabled'
      | 'role'
      | 'description'
      | 'category'
      | 'tags'
      | 'skills'
      | 'prompt_overrides'
      | 'sort_order'
    >
  >,
  scope?: AgentScopeInput
): Promise<Agent> {
  return apiFetch(withAgentScope(`/agents/${encodeURIComponent(id)}`, scope), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function resetAgent(id: string, scope?: AgentScopeInput): Promise<Agent> {
  return apiFetch(withAgentScope(`/agents/${encodeURIComponent(id)}/reset`, scope), { method: 'POST' });
}

export function duplicateAgent(id: string, scope?: AgentScopeInput): Promise<{ id: string }> {
  return apiFetch(withAgentScope(`/agents/${encodeURIComponent(id)}/duplicate`, scope), { method: 'POST' });
}

export function deleteAgent(id: string, scope?: AgentScopeInput): Promise<{ ok: boolean }> {
  return apiFetch(withAgentScope(`/agents/${encodeURIComponent(id)}`, scope), { method: 'DELETE' });
}

// --- Marketplace (embedded) ---
export function listMarketplaceAgents(scope?: AgentScopeInput): Promise<MarketplaceAgent[]> {
  return apiFetch(withAgentScope('/marketplace/agents', scope));
}

export function installMarketplaceAgent(presetKey: string, scope?: AgentScopeInput): Promise<{ id: string }> {
  return apiFetch(withAgentScope(`/marketplace/agents/${encodeURIComponent(presetKey)}/install`, scope), { method: 'POST' });
}

// --- Skills ---
export function listSkills(): Promise<InstalledSkill[]> {
  return apiFetch('/skills');
}

export function createSkill(input: {
  slug: string;
  display_name?: string | null;
  description?: string | null;
  tier?: InstalledSkill['tier'];
  enabled?: boolean;
  capabilities?: SkillCapabilities;
}): Promise<InstalledSkill> {
  return apiFetch('/skills', { method: 'POST', body: JSON.stringify(input) });
}

export function patchSkill(
  slug: string,
  patch: Partial<Pick<InstalledSkill, 'display_name' | 'description' | 'tier' | 'enabled'>> & {
    capabilities?: SkillCapabilities;
  }
): Promise<InstalledSkill> {
  return apiFetch(`/skills/${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function resetSkill(slug: string): Promise<InstalledSkill> {
  return apiFetch(`/skills/${encodeURIComponent(slug)}/reset`, { method: 'POST' });
}

export function deleteSkill(slug: string): Promise<{ ok: boolean }> {
  return apiFetch(`/skills/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export function listMarketplaceSkills(): Promise<MarketplaceSkill[]> {
  return apiFetch('/marketplace/skills');
}

export function installMarketplaceSkill(presetKey: string): Promise<{ slug: string }> {
  return apiFetch(`/marketplace/skills/${encodeURIComponent(presetKey)}/install`, { method: 'POST' });
}

// --- Docs ---
export function getOverviewDoc(): Promise<DocContent> {
  return apiFetch('/docs/overview');
}

export function updateOverviewDoc(content: string): Promise<{ ok: boolean }> {
  return apiFetch('/docs/overview', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function getBoardDoc(boardId: string): Promise<DocContent> {
  return apiFetch(`/docs/boards/${encodeURIComponent(boardId)}`);
}

export function updateBoardDoc(boardId: string, content: string): Promise<{ ok: boolean }> {
  return apiFetch(`/docs/boards/${encodeURIComponent(boardId)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function getBoardChangelog(boardId: string): Promise<DocContent> {
  return apiFetch(`/docs/boards/${encodeURIComponent(boardId)}/changelog`);
}

export function appendBoardSummary(boardId: string, input: { title: string; summary: string }): Promise<{ ok: boolean }> {
  return apiFetch(`/docs/boards/${encodeURIComponent(boardId)}/summary`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
