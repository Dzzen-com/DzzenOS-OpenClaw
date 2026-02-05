-- DzzenOS schema update: Kanban statuses + task sessions + checklist + chat

PRAGMA foreign_keys = OFF;

-- Rebuild tasks table to update status enum
CREATE TABLE IF NOT EXISTS tasks_new (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ideas'
    CHECK (status IN ('ideas','todo','doing','review','release','done','archived')),
  position INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

INSERT INTO tasks_new (id, board_id, title, description, status, position, due_at, created_at, updated_at)
SELECT
  id,
  board_id,
  title,
  description,
  CASE
    WHEN status = 'blocked' THEN 'review'
    WHEN status = 'todo' THEN 'todo'
    WHEN status = 'doing' THEN 'doing'
    WHEN status = 'done' THEN 'done'
    ELSE 'ideas'
  END as status,
  position,
  due_at,
  created_at,
  updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW BEGIN
  UPDATE tasks SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

-- One session per task (orchestrator + OpenClaw session key)
CREATE TABLE IF NOT EXISTS task_sessions (
  task_id TEXT PRIMARY KEY,
  agent_id TEXT,
  session_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle','running','failed')),
  last_run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_agent_id ON task_sessions(agent_id);

CREATE TRIGGER IF NOT EXISTS trg_task_sessions_updated_at
AFTER UPDATE ON task_sessions
FOR EACH ROW BEGIN
  UPDATE task_sessions SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE task_id = OLD.task_id;
END;

-- Checklist items per task
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'todo'
    CHECK (state IN ('todo','doing','done')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_task_id ON task_checklist_items(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_state ON task_checklist_items(state);

CREATE TRIGGER IF NOT EXISTS trg_task_checklist_updated_at
AFTER UPDATE ON task_checklist_items
FOR EACH ROW BEGIN
  UPDATE task_checklist_items SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = OLD.id;
END;

-- Optional chat cache for task sessions
CREATE TABLE IF NOT EXISTS task_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON task_messages(task_id);
