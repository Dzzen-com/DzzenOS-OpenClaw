-- DzzenOS SQLite performance indexes for hot task/chat/run queries

-- Board task list: WHERE board_id = ? ORDER BY position, created_at
CREATE INDEX IF NOT EXISTS idx_tasks_board_position_created_at
ON tasks(board_id, position, created_at);

-- Latest run per task: WHERE task_id = ? ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_created_at
ON agent_runs(task_id, created_at DESC);

-- Runs feed: WHERE status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created_at
ON agent_runs(status, created_at DESC);

-- Task chat: WHERE task_id = ? ORDER BY created_at ASC
CREATE INDEX IF NOT EXISTS idx_task_messages_task_created_at
ON task_messages(task_id, created_at);

-- Approvals feed: WHERE status = ? ORDER BY requested_at DESC
CREATE INDEX IF NOT EXISTS idx_approvals_status_requested_at
ON approvals(status, requested_at DESC);
