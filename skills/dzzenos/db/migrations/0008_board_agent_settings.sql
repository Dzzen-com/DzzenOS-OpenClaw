-- Board-level agent overlays and delegation settings.

CREATE TABLE IF NOT EXISTS board_agent_settings (
  board_id TEXT PRIMARY KEY,
  preferred_agent_id TEXT,
  skills_json TEXT NOT NULL DEFAULT '[]',
  prompt_overrides_json TEXT NOT NULL DEFAULT '{}',
  policy_json TEXT NOT NULL DEFAULT '{}',
  memory_path TEXT,
  auto_delegate INTEGER NOT NULL DEFAULT 1,
  sub_agents_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (preferred_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_board_agent_settings_preferred_agent
  ON board_agent_settings(preferred_agent_id);

CREATE TRIGGER IF NOT EXISTS trg_board_agent_settings_updated_at
AFTER UPDATE ON board_agent_settings
FOR EACH ROW BEGIN
  UPDATE board_agent_settings
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE board_id = OLD.board_id;
END;
