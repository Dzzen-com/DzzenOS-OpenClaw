-- Sub-agents orchestration + Memory Hub (UI v2)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_subagents (
  id TEXT PRIMARY KEY,
  parent_agent_id TEXT NOT NULL,
  child_agent_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  trigger_rules_json TEXT NOT NULL DEFAULT '{}',
  max_calls INTEGER NOT NULL DEFAULT 3,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(parent_agent_id, child_agent_id),
  FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (child_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_subagents_parent_sort
  ON agent_subagents(parent_agent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_agent_subagents_child
  ON agent_subagents(child_agent_id);

CREATE TRIGGER IF NOT EXISTS trg_agent_subagents_updated_at
AFTER UPDATE ON agent_subagents
FOR EACH ROW
BEGIN
  UPDATE agent_subagents
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS agent_orchestration_policies (
  agent_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'openclaw'
    CHECK (mode IN ('openclaw')),
  delegation_budget_json TEXT NOT NULL DEFAULT '{"max_total_calls":8,"max_parallel":2}',
  escalation_rules_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_agent_orchestration_updated_at
AFTER UPDATE ON agent_orchestration_policies
FOR EACH ROW
BEGIN
  UPDATE agent_orchestration_policies
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE agent_id = OLD.agent_id;
END;

CREATE TABLE IF NOT EXISTS memory_docs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL
    CHECK (scope IN ('overview', 'project', 'section', 'agent', 'task')),
  scope_id TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_docs_scope
  ON memory_docs(scope, scope_id);

CREATE TRIGGER IF NOT EXISTS trg_memory_docs_updated_at
AFTER UPDATE ON memory_docs
FOR EACH ROW
BEGIN
  UPDATE memory_docs
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS memory_index_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  started_at TEXT,
  finished_at TEXT,
  stats_json TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_index_jobs_status_created
  ON memory_index_jobs(status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_memory_index_jobs_updated_at
AFTER UPDATE ON memory_index_jobs
FOR EACH ROW
BEGIN
  UPDATE memory_index_jobs
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS memory_model_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider_id TEXT,
  model_id TEXT,
  embedding_model_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO memory_model_config(id, provider_id, model_id, embedding_model_id)
VALUES (1, NULL, NULL, NULL);

CREATE TRIGGER IF NOT EXISTS trg_memory_model_config_updated_at
AFTER UPDATE ON memory_model_config
FOR EACH ROW
BEGIN
  UPDATE memory_model_config
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = 1;
END;
