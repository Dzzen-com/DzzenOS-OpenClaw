-- Project ordering + archiving

PRAGMA foreign_keys = OFF;

ALTER TABLE workspaces ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0
  CHECK (is_archived IN (0, 1));
ALTER TABLE workspaces ADD COLUMN archived_at TEXT;

UPDATE workspaces
   SET position = (
     SELECT COUNT(*) - 1
       FROM workspaces w2
      WHERE w2.created_at < workspaces.created_at
         OR (w2.created_at = workspaces.created_at AND w2.id <= workspaces.id)
   )
 WHERE position = 0;

CREATE INDEX IF NOT EXISTS idx_workspaces_active_position
  ON workspaces(is_archived, position, created_at);

PRAGMA foreign_keys = ON;
