-- Add reasoning level per task session + optional token usage on runs

ALTER TABLE task_sessions
ADD COLUMN reasoning_level TEXT NOT NULL DEFAULT 'auto'
  CHECK (reasoning_level IN ('auto','off','low','medium','high'));

ALTER TABLE agent_runs
ADD COLUMN input_tokens INTEGER;

ALTER TABLE agent_runs
ADD COLUMN output_tokens INTEGER;

ALTER TABLE agent_runs
ADD COLUMN total_tokens INTEGER;
