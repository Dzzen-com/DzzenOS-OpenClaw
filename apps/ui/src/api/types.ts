export type Board = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskStatus = 'ideas' | 'todo' | 'doing' | 'review' | 'release' | 'done' | 'archived';
export type ChecklistState = 'todo' | 'doing' | 'done';
export type ReasoningLevel = 'auto' | 'off' | 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  board_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
  due_at: string | null;
  agent_id?: string | null;
  created_at: string;
  updated_at: string;
  session_status?: 'idle' | 'running' | 'failed' | null;
  last_run_id?: string | null;
  agent_display_name?: string | null;
  run_status?: AgentRunStatus | null;
  run_started_at?: string | null;
  run_updated_at?: string | null;
  run_finished_at?: string | null;
  run_step_kind?: string | null;
};

export type TaskSession = {
  task_id: string;
  agent_id: string | null;
  session_key: string;
  status: 'idle' | 'running' | 'failed';
  last_run_id: string | null;
  reasoning_level?: ReasoningLevel | null;
  created_at: string;
  updated_at: string;
  agent_display_name?: string | null;
  agent_openclaw_id?: string | null;
};

export type TaskChecklistItem = {
  id: string;
  task_id: string;
  title: string;
  state: ChecklistState;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskMessage = {
  id: string;
  task_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export type DocContent = {
  content: string;
};

export type Agent = {
  id: string;
  display_name: string;
  emoji: string | null;
  openclaw_agent_id: string;
  enabled: boolean;
  role: string | null;
  description: string | null;
  category: string;
  tags: string[];
  skills: string[];
  prompt_overrides: PromptOverrides;
  preset_key: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  assigned_task_count: number;
  run_count_7d: number;
  last_used_at: string | null;
  model?: string | null;
  tools_json?: string | null;
  policy_json?: string | null;
  skills_json?: string | null;
  guardrails_json?: string | null;
  parsed_tools?: unknown;
  parsed_policy?: unknown;
  parsed_skills?: unknown;
  parsed_guardrails?: unknown;
};

export type PromptOverrides = Partial<Record<'system' | 'plan' | 'execute' | 'chat' | 'report', string>>;

export type MarketplaceAgent = {
  preset_key: string;
  display_name: string;
  emoji: string;
  description: string;
  category: string;
  tags: string[];
  skills: string[];
  prompt_overrides: PromptOverrides;
  requires_subscription: boolean;
  tier: 'official' | 'verified' | 'community';
  sort_order: number;
  installed: boolean;
  installed_agent_id: string | null;
};

export type SkillCapabilities = {
  network?: boolean;
  filesystem?: boolean;
  external_write?: boolean;
  secrets?: string[];
};

export type OpenClawProvider = {
  id: string;
  kind: string;
  enabled: boolean;
  auth_mode: 'api_key' | 'oauth' | 'none';
  auth_state: 'connected' | 'pending' | 'error' | 'not_configured';
  last_error: string | null;
};

export type OpenClawModel = {
  id: string;
  provider_id: string;
  display_name: string;
  availability: 'ready' | 'degraded' | 'unavailable' | 'unknown';
};

export type ModelsOverview = {
  providers: OpenClawProvider[];
  models: OpenClawModel[];
  updated_at: string;
};

export type OpenClawProviderInput = {
  id: string;
  kind: string;
  enabled?: boolean;
  auth_mode?: 'api_key' | 'oauth' | 'none';
  api_base_url?: string;
  api_key?: string;
  oauth?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type OpenClawOAuthStartResult = {
  provider_id: string;
  attempt_id: string | null;
  auth_url: string | null;
  status: string | null;
  expires_at: string | null;
};

export type OpenClawOAuthStatusResult = {
  provider_id: string;
  attempt_id: string | null;
  status: 'connected' | 'pending' | 'error' | 'timeout' | 'not_configured';
  message: string | null;
};

export type InstalledSkill = {
  slug: string;
  display_name: string | null;
  description: string | null;
  tier: 'official' | 'verified' | 'community';
  enabled: boolean;
  source: 'manual' | 'marketplace';
  preset_key: string | null;
  sort_order: number;
  capabilities: SkillCapabilities;
  created_at: string;
  updated_at: string;
};

export type MarketplaceSkill = {
  preset_key: string;
  slug: string;
  display_name: string;
  description: string;
  tier: 'official' | 'verified' | 'community';
  capabilities: SkillCapabilities;
  requires_subscription: boolean;
  sort_order: number;
  installed: boolean;
};

export type RunStepStatus = 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';

export type RunStep = {
  id: string;
  run_id: string;
  step_index: number;
  kind: string;
  status: RunStepStatus;
  input_json: string | null;
  output_json: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AgentRun = {
  id: string;
  workspace_id: string;
  board_id: string | null;
  task_id: string | null;
  agent_name: string | null;
  status: AgentRunStatus;
  started_at: string;
  finished_at: string | null;
  config_snapshot_json: string | null;
  created_at: string;
  updated_at: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  is_stuck: boolean;
  steps: RunStep[];
};

// Dashboard list items (no steps).
export type AgentRunListItem = Omit<AgentRun, 'steps'> & {
  task_title: string | null;
};

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type Approval = {
  id: string;
  run_id: string;
  step_id: string | null;
  status: ApprovalStatus;
  request_title: string | null;
  request_body: string | null;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined for dashboard linking.
  task_id: string | null;
  board_id: string | null;
  task_title: string | null;
};

export type Automation = {
  id: string;
  name: string;
  description: string | null;
  graph_json?: string; // present on GET /automations/:id
  created_at: string;
  updated_at: string;
};

export type TaskExecutionConfig = {
  task_id: string;
  board_id: string;
  managed_by: 'agent-profile';
  read_only: boolean;
  resolved_at: string;
  agent: Agent;
  resolved: {
    source: 'agent-profile';
    model: string;
    tools: unknown;
    policy: unknown;
    skills: unknown;
    guardrails: unknown;
  };
};

export type TaskContextItem = {
  id: string;
  task_id: string;
  kind: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};
