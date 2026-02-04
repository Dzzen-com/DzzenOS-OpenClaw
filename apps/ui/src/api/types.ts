export type Board = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked';

export type Task = {
  id: string;
  board_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
  due_at: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
  is_stuck: boolean;
  steps: RunStep[];
};
