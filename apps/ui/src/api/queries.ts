import { apiFetch } from './client';
import type { AgentRun, Board, Task, TaskStatus } from './types';

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
