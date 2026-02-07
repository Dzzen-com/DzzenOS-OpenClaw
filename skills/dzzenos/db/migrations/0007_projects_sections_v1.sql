-- Projects + Sections + custom project statuses (v1)
-- Keep legacy workspaces/boards tables as storage layer, expose projects/sections via API.

PRAGMA foreign_keys = OFF;

ALTER TABLE boards ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'kanban'
  CHECK (view_mode IN ('kanban', 'threads'));

ALTER TABLE boards ADD COLUMN section_kind TEXT NOT NULL DEFAULT 'section'
  CHECK (section_kind IN ('section', 'inbox'));

ALTER TABLE tasks ADD COLUMN workspace_id TEXT;
ALTER TABLE tasks ADD COLUMN is_inbox INTEGER NOT NULL DEFAULT 0;

UPDATE tasks
   SET workspace_id = (
     SELECT b.workspace_id
       FROM boards b
      WHERE b.id = tasks.board_id
   )
 WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_boards_workspace_position ON boards(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_board_status_position ON tasks(workspace_id, board_id, status, position);

CREATE TABLE IF NOT EXISTS project_statuses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status_key TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(workspace_id, status_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_statuses_workspace_id ON project_statuses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_project_statuses_workspace_position ON project_statuses(workspace_id, position);

CREATE TRIGGER IF NOT EXISTS trg_project_statuses_updated_at
AFTER UPDATE ON project_statuses
FOR EACH ROW BEGIN
  UPDATE project_statuses
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_set_workspace_after_insert
AFTER INSERT ON tasks
FOR EACH ROW
WHEN NEW.workspace_id IS NULL
BEGIN
  UPDATE tasks
     SET workspace_id = (SELECT b.workspace_id FROM boards b WHERE b.id = NEW.board_id)
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_set_workspace_after_board_update
AFTER UPDATE OF board_id ON tasks
FOR EACH ROW
BEGIN
  UPDATE tasks
     SET workspace_id = (SELECT b.workspace_id FROM boards b WHERE b.id = NEW.board_id)
   WHERE id = NEW.id;
END;

UPDATE boards
   SET view_mode = CASE
      WHEN lower(name) LIKE '%content%' OR lower(name) LIKE '%marketing%' THEN 'threads'
      ELSE 'kanban'
   END;

UPDATE boards
   SET section_kind = CASE
      WHEN lower(name) = 'inbox' THEN 'inbox'
      ELSE 'section'
   END;

INSERT OR IGNORE INTO project_statuses (id, workspace_id, status_key, label, position)
SELECT
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
   substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  w.id,
  s.status_key,
  s.label,
  s.position
FROM workspaces w
JOIN (
  SELECT 'ideas' AS status_key, 'Ideas' AS label, 0 AS position
  UNION ALL SELECT 'todo', 'To do', 1
  UNION ALL SELECT 'doing', 'In progress', 2
  UNION ALL SELECT 'review', 'Review', 3
  UNION ALL SELECT 'release', 'Release', 4
  UNION ALL SELECT 'done', 'Done', 5
  UNION ALL SELECT 'archived', 'Archived', 6
) s;

INSERT INTO boards (id, workspace_id, name, description, position, view_mode, section_kind)
SELECT
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
   substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  w.id,
  'Inbox',
  'Project intake',
  0,
  'kanban',
  'inbox'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM boards b WHERE b.workspace_id = w.id AND lower(b.name) = 'inbox'
);

INSERT INTO boards (id, workspace_id, name, description, position, view_mode, section_kind)
SELECT
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
   substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  w.id,
  'Product',
  'Product delivery and roadmap',
  1,
  'kanban',
  'section'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM boards b WHERE b.workspace_id = w.id AND lower(b.name) = 'product'
);

INSERT INTO boards (id, workspace_id, name, description, position, view_mode, section_kind)
SELECT
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
   substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  w.id,
  'Marketing',
  'Growth, experiments and distribution',
  2,
  'threads',
  'section'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM boards b WHERE b.workspace_id = w.id AND lower(b.name) = 'marketing'
);

INSERT INTO boards (id, workspace_id, name, description, position, view_mode, section_kind)
SELECT
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
   substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  w.id,
  'Content',
  'Content pipeline and assets',
  3,
  'threads',
  'section'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM boards b WHERE b.workspace_id = w.id AND lower(b.name) = 'content'
);

INSERT INTO boards (id, workspace_id, name, description, position, view_mode, section_kind)
SELECT
  (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
   substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
  w.id,
  'Ops',
  'Operations and admin tasks',
  4,
  'kanban',
  'section'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM boards b WHERE b.workspace_id = w.id AND lower(b.name) = 'ops'
);

UPDATE tasks
   SET is_inbox = 1
 WHERE board_id IN (
   SELECT id FROM boards WHERE section_kind = 'inbox'
 );

PRAGMA foreign_keys = ON;
