-- Agent packs / squads (MVP)

CREATE TABLE IF NOT EXISTS agent_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  orchestrator_agent_id TEXT,
  roles_json TEXT NOT NULL DEFAULT '[]',
  variables_schema_json TEXT,
  defaults_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (orchestrator_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_packs_enabled ON agent_packs(enabled);
CREATE INDEX IF NOT EXISTS idx_agent_packs_orchestrator ON agent_packs(orchestrator_agent_id);

CREATE TRIGGER IF NOT EXISTS trg_agent_packs_updated_at
AFTER UPDATE ON agent_packs
FOR EACH ROW
BEGIN
  UPDATE agent_packs SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

-- Attach optional pack selection to task sessions.
ALTER TABLE task_sessions ADD COLUMN pack_id TEXT;
ALTER TABLE task_sessions ADD COLUMN pack_overrides_json TEXT;

CREATE INDEX IF NOT EXISTS idx_task_sessions_pack_id ON task_sessions(pack_id);
