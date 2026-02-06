-- Agent-first runtime config for task cards

PRAGMA foreign_keys = ON;

-- Task is attached to one orchestrator profile from agents roster.
ALTER TABLE tasks ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);

-- Each run stores immutable resolved config snapshot for audit/reproducibility.
ALTER TABLE agent_runs ADD COLUMN config_snapshot_json TEXT;

-- Extend agent profile with execution config fields.
ALTER TABLE agents ADD COLUMN model TEXT;
ALTER TABLE agents ADD COLUMN tools_json TEXT;
ALTER TABLE agents ADD COLUMN policy_json TEXT;
ALTER TABLE agents ADD COLUMN skills_json TEXT;
ALTER TABLE agents ADD COLUMN guardrails_json TEXT;

-- Optional context pack items attached to a task.
CREATE TABLE IF NOT EXISTS task_context_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  title TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_context_items_task_id ON task_context_items(task_id);

CREATE TRIGGER IF NOT EXISTS trg_task_context_items_updated_at
AFTER UPDATE ON task_context_items
FOR EACH ROW BEGIN
  UPDATE task_context_items
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE id = OLD.id;
END;
