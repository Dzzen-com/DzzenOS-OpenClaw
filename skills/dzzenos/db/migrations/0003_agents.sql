-- Agents roster (v1)

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  emoji TEXT,
  openclaw_agent_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_openclaw_id ON agents(openclaw_agent_id);

CREATE TRIGGER IF NOT EXISTS trg_agents_updated_at
AFTER UPDATE ON agents
FOR EACH ROW
BEGIN
  UPDATE agents SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;
