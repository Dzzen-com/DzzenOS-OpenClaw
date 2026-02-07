-- Scope agents to workspace/project and make preset installs workspace-local.

ALTER TABLE agents ADD COLUMN workspace_id TEXT;

-- Backfill existing agents into the first workspace.
UPDATE agents
SET workspace_id = (
  SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1
)
WHERE workspace_id IS NULL;

DROP INDEX IF EXISTS idx_agents_openclaw_id;
DROP INDEX IF EXISTS idx_agents_preset_key;

CREATE INDEX IF NOT EXISTS idx_agents_workspace_id
  ON agents(workspace_id);

CREATE INDEX IF NOT EXISTS idx_agents_workspace_openclaw_id
  ON agents(workspace_id, openclaw_agent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_workspace_preset_key
  ON agents(workspace_id, preset_key)
  WHERE preset_key IS NOT NULL;
