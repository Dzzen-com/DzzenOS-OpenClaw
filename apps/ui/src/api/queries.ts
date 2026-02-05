import { apiFetch } from './client';
import type {
  AgentRun,
  AgentRunListItem,
  AgentRunStatus,
  Agent,
  MarketplaceAgent,
  Approval,
  ApprovalStatus,
  Automation,
  Board,
  DocContent,
  Task,
  TaskChecklistItem,
  TaskMessage,
  TaskStatus,
  TaskSession,
} from './types';

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

export function listTaskRuns(taskId: string): Promise<AgentRun[]> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/runs`);
}

export function getTaskSession(taskId: string): Promise<TaskSession> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/session`);
}

export function upsertTaskSession(taskId: string, input: { agentId?: string | null }): Promise<TaskSession> {
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
export function listAgents(): Promise<Agent[]> {
  return apiFetch('/agents');
}

export function updateAgents(input: Agent[]): Promise<Agent[]> {
  return apiFetch('/agents', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function createAgent(
  input: Pick<Agent, 'display_name' | 'openclaw_agent_id'> &
    Partial<
      Pick<
        Agent,
        'emoji' | 'enabled' | 'role' | 'description' | 'category' | 'tags' | 'skills' | 'prompt_overrides' | 'sort_order'
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
  >
): Promise<Agent> {
  return apiFetch(`/agents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function resetAgent(id: string): Promise<Agent> {
  return apiFetch(`/agents/${encodeURIComponent(id)}/reset`, { method: 'POST' });
}

export function duplicateAgent(id: string): Promise<{ id: string }> {
  return apiFetch(`/agents/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
}

export function deleteAgent(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- Marketplace (embedded) ---
export function listMarketplaceAgents(): Promise<MarketplaceAgent[]> {
  return apiFetch('/marketplace/agents');
}

export function installMarketplaceAgent(presetKey: string): Promise<{ id: string }> {
  return apiFetch(`/marketplace/agents/${encodeURIComponent(presetKey)}/install`, { method: 'POST' });
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
