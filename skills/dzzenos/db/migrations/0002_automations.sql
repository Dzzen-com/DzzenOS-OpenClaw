-- DzzenOS SQLite schema v2: automations (React Flow graphs stored as JSON)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  graph_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_automations_name ON automations(name);

CREATE TRIGGER IF NOT EXISTS trg_automations_updated_at
AFTER UPDATE ON automations
FOR EACH ROW BEGIN
  UPDATE automations SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;
