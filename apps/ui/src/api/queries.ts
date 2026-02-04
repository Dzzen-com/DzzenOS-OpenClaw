import { apiFetch } from './client';
import type {
  AgentRun,
  AgentRunListItem,
  AgentRunStatus,
  Approval,
  ApprovalStatus,
  Automation,
  Board,
  Task,
  TaskStatus,
} from './types';

export function listBoards(): Promise<Board[]> {
  return apiFetch('/boards');
}

export function listTasks(boardId: string): Promise<Task[]> {
  const qs = new URLSearchParams({ boardId });
  return apiFetch(`/tasks?${qs.toString()}`);
}

export function createTask(input: { title: string; description?: string; boardId: string }): Promise<Task> {
  return apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: input.title, description: input.description ?? null, boardId: input.boardId }),
  });
}

export function patchTask(id: string, patch: { status?: TaskStatus; title?: string; description?: string | null }): Promise<Task> {
  return apiFetch(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function simulateRun(taskId: string): Promise<{ runId: string }> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/simulate-run`, { method: 'POST' });
}

export function listTaskRuns(taskId: string): Promise<AgentRun[]> {
  return apiFetch(`/tasks/${encodeURIComponent(taskId)}/runs`);
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
