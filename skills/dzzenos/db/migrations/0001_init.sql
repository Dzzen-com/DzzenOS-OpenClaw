-- DzzenOS SQLite schema v1 (MVP)
-- Local-first, minimal core entities.
--
-- Notes:
-- - IDs are TEXT (expected: ULID/UUID)
-- - JSON payloads stored as TEXT
-- - All timestamps are ISO8601 strings (UTC)

PRAGMA foreign_keys = ON;

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Boards belong to a workspace
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON boards(workspace_id);

-- Tasks belong to a board
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','doing','done','blocked')),
  position INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Agent runs: execution instances initiated by an agent (or user)
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  board_id TEXT,
  task_id TEXT,
  agent_name TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','failed','cancelled')),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_id ON agent_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

-- Run steps: ordered steps within a run
CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'step',
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','failed','skipped','cancelled')),
  input_json TEXT,
  output_json TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_run_steps_status ON run_steps(status);

-- Approvals: explicit human approvals requested by a run/step
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  request_title TEXT,
  request_body TEXT,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT,
  decided_by TEXT,
  decision_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES run_steps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_run_id ON approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Artifacts: metadata only (content stored elsewhere on disk/object store)
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  kind TEXT NOT NULL DEFAULT 'file',
  uri TEXT NOT NULL,
  mime_type TEXT,
  sha256 TEXT,
  size_bytes INTEGER,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES run_steps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_step_id ON artifacts(step_id);

-- Updated-at triggers
CREATE TRIGGER IF NOT EXISTS trg_workspaces_updated_at
AFTER UPDATE ON workspaces
FOR EACH ROW BEGIN
  UPDATE workspaces SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_boards_updated_at
AFTER UPDATE ON boards
FOR EACH ROW BEGIN
  UPDATE boards SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW BEGIN
  UPDATE tasks SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_runs_updated_at
AFTER UPDATE ON agent_runs
FOR EACH ROW BEGIN
  UPDATE agent_runs SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_run_steps_updated_at
AFTER UPDATE ON run_steps
FOR EACH ROW BEGIN
  UPDATE run_steps SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_approvals_updated_at
AFTER UPDATE ON approvals
FOR EACH ROW BEGIN
  UPDATE approvals SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;
