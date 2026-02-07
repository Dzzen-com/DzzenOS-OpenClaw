-- Bind local heartbeat/standup settings to OpenClaw Cron job ids.

ALTER TABLE agent_heartbeat_settings ADD COLUMN cron_job_id TEXT;
ALTER TABLE agent_heartbeat_settings ADD COLUMN last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_heartbeat_settings_cron_job_id
  ON agent_heartbeat_settings(cron_job_id)
  WHERE cron_job_id IS NOT NULL;

ALTER TABLE workspace_standup_settings ADD COLUMN cron_job_id TEXT;
ALTER TABLE workspace_standup_settings ADD COLUMN last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_standup_settings_cron_job_id
  ON workspace_standup_settings(cron_job_id)
  WHERE cron_job_id IS NOT NULL;
