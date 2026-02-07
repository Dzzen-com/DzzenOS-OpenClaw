-- Stage 5 runtime: heartbeats, notifications/subscriptions, and workspace standups.

CREATE TABLE IF NOT EXISTS agent_heartbeat_settings (
  agent_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  offset_minutes INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'isolated'
    CHECK (mode IN ('isolated','main')),
  message TEXT NOT NULL DEFAULT 'Check mentions, assigned tasks, and activity feed. If nothing actionable, reply HEARTBEAT_OK.',
  model TEXT,
  next_run_at TEXT,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_heartbeat_settings_workspace
  ON agent_heartbeat_settings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_agent_heartbeat_settings_due
  ON agent_heartbeat_settings(enabled, next_run_at);

CREATE TRIGGER IF NOT EXISTS trg_agent_heartbeat_settings_updated_at
AFTER UPDATE ON agent_heartbeat_settings
FOR EACH ROW BEGIN
  UPDATE agent_heartbeat_settings
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE agent_id = OLD.agent_id;
END;

CREATE TABLE IF NOT EXISTS task_thread_subscriptions (
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (task_id, agent_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_thread_subscriptions_agent
  ON task_thread_subscriptions(agent_id);

CREATE TRIGGER IF NOT EXISTS trg_task_thread_subscriptions_updated_at
AFTER UPDATE ON task_thread_subscriptions
FOR EACH ROW BEGIN
  UPDATE task_thread_subscriptions
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE task_id = OLD.task_id AND agent_id = OLD.agent_id;
END;

CREATE TABLE IF NOT EXISTS agent_notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  board_id TEXT,
  task_id TEXT,
  mentioned_agent_id TEXT NOT NULL,
  trigger_agent_id TEXT,
  trigger_message_id TEXT,
  kind TEXT NOT NULL DEFAULT 'mention'
    CHECK (kind IN ('mention','subscription')),
  content TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (mentioned_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (trigger_message_id) REFERENCES task_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_queue
  ON agent_notifications(delivered, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent
  ON agent_notifications(mentioned_agent_id, delivered, created_at);

CREATE TRIGGER IF NOT EXISTS trg_agent_notifications_updated_at
AFTER UPDATE ON agent_notifications
FOR EACH ROW BEGIN
  UPDATE agent_notifications
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS workspace_standup_settings (
  workspace_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  time_utc TEXT NOT NULL DEFAULT '23:30',
  prompt TEXT,
  model TEXT,
  next_run_at TEXT,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_workspace_standup_settings_updated_at
AFTER UPDATE ON workspace_standup_settings
FOR EACH ROW BEGIN
  UPDATE workspace_standup_settings
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE workspace_id = OLD.workspace_id;
END;

CREATE TABLE IF NOT EXISTS workspace_standup_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_workspace_standup_reports_workspace
  ON workspace_standup_reports(workspace_id, created_at DESC);
