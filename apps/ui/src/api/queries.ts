import { apiFetch } from './client';
import type {
  AgentRun,
  AgentRunListItem,
  AgentRunStatus,
  Agent,
  ModelsOverview,
  OpenClawOAuthStartResult,
  OpenClawOAuthStatusResult,
  OpenClawProviderInput,
  MarketplaceAgent,
  InstalledSkill,
  MarketplaceSkill,
  SkillCapabilities,
  Approval,
  ApprovalStatus,
  Automation,
  Project,
  ProjectStatus,
  Section,
  Board,
  DocContent,
  Task,
  TaskChecklistItem,
  TaskMessage,
  TaskStatus,
  TaskSession,
} from './types';

export function listProjects(): Promise<Project[]> {
  return apiFetch('/projects');
}

export function createProject(input: { name: string; description?: string | null }): Promise<Project> {
  return apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: input.name, description: input.description ?? null }),
  });
}

export function patchProject(id: string, patch: { name?: string; description?: string | null }): Promise<Project> {
  return apiFetch(`/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteProject(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function listSections(projectId: string): Promise<Section[]> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/sections`);
}

export function createSection(
  projectId: string,
  input: {
    name: string;
    description?: string | null;
    position?: number;
    viewMode?: 'kanban' | 'threads';
    sectionKind?: 'section' | 'inbox';
  }
): Promise<Section> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/sections`, {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? null,
      position: input.position ?? 0,
      viewMode: input.viewMode ?? 'kanban',
      sectionKind: input.sectionKind ?? 'section',
    }),
  });
}

export function patchSection(
  projectId: string,
  sectionId: string,
  patch: {
    name?: string;
    description?: string | null;
    position?: number;
    viewMode?: 'kanban' | 'threads';
    sectionKind?: 'section' | 'inbox';
  }
): Promise<Section> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteSection(projectId: string, sectionId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionId)}`, {
    method: 'DELETE',
  });
}

export function listProjectStatuses(projectId: string): Promise<ProjectStatus[]> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/statuses`);
}

export function createProjectStatus(
  projectId: string,
  input: { statusKey: string; label: string; position?: number }
): Promise<ProjectStatus> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/statuses`, {
    method: 'POST',
    body: JSON.stringify({ status_key: input.statusKey, label: input.label, position: input.position ?? 0 }),
  });
}

export function patchProjectStatus(
  projectId: string,
  statusId: string,
  patch: { statusKey?: string; label?: string; position?: number }
): Promise<ProjectStatus> {
  const body: Record<string, unknown> = {};
  if (patch.statusKey !== undefined) body.status_key = patch.statusKey;
  if (patch.label !== undefined) body.label = patch.label;
  if (patch.position !== undefined) body.position = patch.position;
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/statuses/${encodeURIComponent(statusId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// Legacy wrappers (board -> section).
export function listBoards(): Promise<Board[]> {
  return apiFetch('/boards');
}

export function createBoard(input: {
  name: string;
  description?: string | null;
  position?: number;
  workspaceId?: string | null;
  projectId?: string | null;
  viewMode?: 'kanban' | 'threads';
  sectionKind?: 'section' | 'inbox';
}): Promise<Board> {
  return apiFetch('/boards', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description ?? null,
      position: input.position ?? 0,
      projectId: input.projectId ?? input.workspaceId ?? null,
      workspaceId: input.projectId ?? input.workspaceId ?? null,
      viewMode: input.viewMode,
      sectionKind: input.sectionKind,
    }),
  });
}

export function patchBoard(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    position?: number;
    viewMode?: 'kanban' | 'threads';
    sectionKind?: 'section' | 'inbox';
  }
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

export function listTasks(input: string | { projectId?: string; sectionId?: string; viewMode?: 'kanban' | 'threads' }): Promise<Task[]> {
  const qs = new URLSearchParams();
  if (typeof input === 'string') {
    qs.set('sectionId', input);
  } else {
    if (input.projectId) qs.set('projectId', input.projectId);
    if (input.sectionId) qs.set('sectionId', input.sectionId);
    if (input.viewMode) qs.set('viewMode', input.viewMode);
  }
  return apiFetch(`/tasks?${qs.toString()}`);
}

export function createTask(input: {
  title: string;
  description?: string;
  projectId?: string;
  sectionId?: string;
  boardId?: string;
  status?: TaskStatus;
}): Promise<Task> {
  return apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      sectionId: input.sectionId ?? input.boardId ?? null,
      boardId: input.sectionId ?? input.boardId ?? null,
      status: input.status,
    }),
  });
}

export function patchTask(
  id: string,
  patch: {
    status?: TaskStatus;
    title?: string;
    description?: string | null;
    position?: number;
    sectionId?: string;
    boardId?: string;
  }
): Promise<Task> {
  return apiFetch(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function reorderTasks(input: { boardId: string; orderedIds: string[] }): Promise<{ ok: boolean }> {
  return apiFetch('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({
      sectionId: input.boardId,
      boardId: input.boardId,
      orderedIds: input.orderedIds,
    }),
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

export function listRuns(input?: { status?: AgentRunStatus; stuckMinutes?: number; projectId?: string }): Promise<AgentRunListItem[]> {
  const qs = new URLSearchParams();
  if (input?.status) qs.set('status', input.status);
  if (input?.stuckMinutes != null) qs.set('stuckMinutes', String(input.stuckMinutes));
  if (input?.projectId) qs.set('projectId', input.projectId);
  const suf = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/runs${suf}`);
}

export function listApprovals(input?: { status?: ApprovalStatus; projectId?: string }): Promise<Approval[]> {
  const qs = new URLSearchParams();
  if (input?.status) qs.set('status', input.status);
  if (input?.projectId) qs.set('projectId', input.projectId);
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

// --- OpenClaw Models / Providers ---
export function listModelsOverview(): Promise<ModelsOverview> {
  return apiFetch('/openclaw/models/overview');
}

export function createModelProvider(input: OpenClawProviderInput): Promise<ModelsOverview> {
  return apiFetch('/openclaw/models/providers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateModelProvider(id: string, patch: Partial<OpenClawProviderInput>): Promise<ModelsOverview> {
  return apiFetch(`/openclaw/models/providers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteModelProvider(id: string): Promise<{ ok: boolean; overview: ModelsOverview }> {
  return apiFetch(`/openclaw/models/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function scanModels(): Promise<ModelsOverview> {
  return apiFetch('/openclaw/models/scan', { method: 'POST', body: JSON.stringify({}) });
}

export function applyModelsConfig(): Promise<ModelsOverview> {
  return apiFetch('/openclaw/models/apply', { method: 'POST', body: JSON.stringify({}) });
}

export function startModelProviderOAuth(id: string): Promise<OpenClawOAuthStartResult> {
  return apiFetch(`/openclaw/models/providers/${encodeURIComponent(id)}/oauth/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getModelProviderOAuthStatus(
  id: string,
  input?: { attemptId?: string | null }
): Promise<OpenClawOAuthStatusResult> {
  const qs = new URLSearchParams();
  if (input?.attemptId) qs.set('attemptId', input.attemptId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/openclaw/models/providers/${encodeURIComponent(id)}/oauth/status${suffix}`);
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

export function getSectionDoc(sectionId: string): Promise<DocContent> {
  return apiFetch(`/docs/sections/${encodeURIComponent(sectionId)}`);
}

export function updateSectionDoc(sectionId: string, content: string): Promise<{ ok: boolean }> {
  return apiFetch(`/docs/sections/${encodeURIComponent(sectionId)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function getSectionChangelog(sectionId: string): Promise<DocContent> {
  return apiFetch(`/docs/sections/${encodeURIComponent(sectionId)}/changelog`);
}

export function appendSectionSummary(sectionId: string, input: { title: string; summary: string }): Promise<{ ok: boolean }> {
  return apiFetch(`/docs/sections/${encodeURIComponent(sectionId)}/summary`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Legacy aliases.
export const getBoardDoc = getSectionDoc;
export const updateBoardDoc = updateSectionDoc;
export const getBoardChangelog = getSectionChangelog;
export const appendBoardSummary = appendSectionSummary;
