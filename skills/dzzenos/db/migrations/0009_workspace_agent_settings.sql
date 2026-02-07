-- Workspace/project-level agent overlays and delegation defaults.

CREATE TABLE IF NOT EXISTS workspace_agent_settings (
  workspace_id TEXT PRIMARY KEY,
  preferred_agent_id TEXT,
  skills_json TEXT NOT NULL DEFAULT '[]',
  prompt_overrides_json TEXT NOT NULL DEFAULT '{}',
  policy_json TEXT NOT NULL DEFAULT '{}',
  memory_path TEXT,
  auto_delegate INTEGER NOT NULL DEFAULT 1,
  sub_agents_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (preferred_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_settings_preferred_agent
  ON workspace_agent_settings(preferred_agent_id);

CREATE TRIGGER IF NOT EXISTS trg_workspace_agent_settings_updated_at
AFTER UPDATE ON workspace_agent_settings
FOR EACH ROW BEGIN
  UPDATE workspace_agent_settings
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE workspace_id = OLD.workspace_id;
END;
