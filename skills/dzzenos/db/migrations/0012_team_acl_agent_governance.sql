-- Team mode ACL + agent governance + session execution mode

PRAGMA foreign_keys = ON;

ALTER TABLE agents ADD COLUMN agent_level TEXT NOT NULL DEFAULT 'L1'
  CHECK (agent_level IN ('L1','L2','L3','L4'));

ALTER TABLE agents ADD COLUMN onboarding_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (onboarding_state IN ('pending','in_progress','done','blocked'));

ALTER TABLE agents ADD COLUMN review_score REAL;
ALTER TABLE agents ADD COLUMN review_cycle_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE agents ADD COLUMN promotion_block_reason TEXT;
ALTER TABLE agents ADD COLUMN last_reviewed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_level ON agents(agent_level);
CREATE INDEX IF NOT EXISTS idx_agents_onboarding_state ON agents(onboarding_state);

ALTER TABLE task_sessions ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'single'
  CHECK (execution_mode IN ('single','squad'));

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','invited','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW BEGIN
  UPDATE users
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  last_seen_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('owner','admin','operator','contributor','viewer')),
  invited_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON workspace_members(role);

CREATE TRIGGER IF NOT EXISTS trg_workspace_members_updated_at
AFTER UPDATE ON workspace_members
FOR EACH ROW BEGIN
  UPDATE workspace_members
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id;
END;

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('owner','admin','operator','contributor','viewer')),
  invited_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (board_id, user_id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_board_members_user_id ON board_members(user_id);
CREATE INDEX IF NOT EXISTS idx_board_members_role ON board_members(role);

CREATE TRIGGER IF NOT EXISTS trg_board_members_updated_at
AFTER UPDATE ON board_members
FOR EACH ROW BEGIN
  UPDATE board_members
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE board_id = OLD.board_id AND user_id = OLD.user_id;
END;

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  board_id TEXT,
  email TEXT,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('owner','admin','operator','contributor','viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at TEXT,
  accepted_by_user_id TEXT,
  accepted_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_workspace_id ON invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invites_board_id ON invites(board_id);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);

CREATE TRIGGER IF NOT EXISTS trg_invites_updated_at
AFTER UPDATE ON invites
FOR EACH ROW BEGIN
  UPDATE invites
     SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  workspace_id TEXT,
  board_id TEXT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_created
  ON audit_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created
  ON audit_events(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type_created
  ON audit_events(event_type, created_at DESC);
