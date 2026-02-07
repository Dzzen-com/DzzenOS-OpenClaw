# Database (SQLite)

DzzenOS is **local-first**. The MVP stores its core entities in a single **SQLite** file.

By default, this DB is **not** stored inside OpenClaw runtime/state folders.
It is stored in DzzenOS app data folders (see paths below).

See also: `Docs/DATA-POLICY.md`.

## Default DB location

By default, DzzenOS stores SQLite outside the git repo in a stable user/system data directory:

- Linux: `~/.local/share/dzzenos-openclaw/dzzenos.db` (or `$XDG_DATA_HOME/dzzenos-openclaw/dzzenos.db`)
- macOS: `~/Library/Application Support/DzzenOS-OpenClaw/dzzenos.db`
- Windows: `%APPDATA%/DzzenOS-OpenClaw/dzzenos.db`

Workspace docs/memory are also stored outside the repo by default:

- Linux: `~/.local/share/dzzenos-openclaw/workspace/`
- macOS: `~/Library/Application Support/DzzenOS-OpenClaw/workspace/`
- Windows: `%APPDATA%/DzzenOS-OpenClaw/workspace/`

Overrides:

- `DZZENOS_DATA_DIR=/custom/data/dir` (uses `/custom/data/dir/dzzenos.db`)
- `DZZENOS_DB_PATH=/custom/path/dzzenos.db`
- `DZZENOS_WORKSPACE_DIR=/custom/workspace/dir`
- CLI: `--db /custom/path/dzzenos.db`

When moving from old installs (`./data/dzzenos.db`), DzzenOS performs a one-time automatic legacy DB move when using the new default path.

## Runtime SQLite tuning

DzzenOS API enables WAL mode and applies conservative runtime pragmas for better concurrency and responsiveness:

- `busy_timeout` (default: `5000` ms)
- `synchronous` (default: `NORMAL`)
- `temp_store=MEMORY`

Optional env overrides:

- `DZZENOS_SQLITE_BUSY_TIMEOUT_MS=8000`
- `DZZENOS_SQLITE_SYNCHRONOUS=OFF|NORMAL|FULL`

### Pagination defaults

To avoid large payloads on growing history tables:

- `GET /runs` default page size: `DZZENOS_RUNS_PAGE_SIZE` (default `100`, max `500`)
- `GET /tasks/:id/runs` default page size: `DZZENOS_TASK_RUNS_PAGE_SIZE` (default `50`, max `200`)
- `GET /tasks/:id/chat` default page size: `DZZENOS_CHAT_PAGE_SIZE` (default `200`, max `1000`)

All endpoints above support `?before=<ISO timestamp>&limit=<n>`.

### Retention defaults

DzzenOS runs periodic cleanup to keep SQLite size predictable:

- `DZZENOS_RETENTION_TASK_MESSAGES_PER_TASK` (default `2000`)
- `DZZENOS_RETENTION_RUNS_PER_TASK` (default `300`)
- `DZZENOS_RETENTION_RUNS_MAX_AGE_DAYS` (default `90`)
- `DZZENOS_RETENTION_CLEANUP_INTERVAL_SECONDS` (default `900`)

Set any of these to `0` to disable that specific rule.

## Migrations

Migrations are plain SQL files in:

- `skills/dzzenos/db/migrations/*.sql`

Applied migrations are tracked in `schema_migrations`.

### Run migrations

From the repo root:

```bash
# Uses default stable data-dir path (outside repo)
node --experimental-strip-types skills/dzzenos/db/migrate.ts

# Or specify a DB path
node --experimental-strip-types skills/dzzenos/db/migrate.ts --db ./data/dzzenos.dev.db

# Or specify a custom migrations folder
node --experimental-strip-types skills/dzzenos/db/migrate.ts --migrations ./somewhere/migrations --db /absolute/path/dzzenos.db
```

### Migration safety policy

- Before applying pending migrations, DzzenOS creates a pre-migration SQLite snapshot backup.
- On migration failure, DzzenOS auto-restores from that snapshot.
- Backup rotation is enabled by default (keeps latest 10 snapshots).

Backup env settings:

- `DZZENOS_DB_BACKUP_DIR=/custom/backup/dir`
- `DZZENOS_DB_BACKUP_KEEP=20`

Manual backup/restore commands:

```bash
# list backups
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup list

# create backup
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup create --name pre-change

# restore backup
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup restore --file <backup.sqlite>
```

## MVP schema (v1)

Entities included:

- `workspaces`
- `boards`
- `tasks`
- `project_statuses`
- `task_sessions` (agent session per task)
- `task_checklist_items`
- `task_messages` (chat cache)
- `agent_runs`
- `run_steps`
- `approvals` (`pending` / `approved` / `rejected`)
- `artifacts` (metadata only)
- `agents`
- `automations`
- `agent_subagents`
- `agent_orchestration_policies`
- `memory_docs`
- `memory_index_jobs`
- `memory_model_config`

## Current project/workspace notes (UI V2)

UI and API expose **Project/Section** terminology, while SQLite keeps legacy table names:

- `projects` -> `workspaces`
- `sections` -> `boards`

Recent schema additions:

- `workspaces.position` — manual order for sidebar/projects list
- `workspaces.is_archived` — project archive flag
- `workspaces.archived_at` — archive timestamp

Task navigation/focus lists use:

- `tasks.status = 'doing'` for in-progress queue
- `tasks.status = 'review'` + pending approvals for needs-user queue

Relevant migrations:

- `0007_projects_sections_v1.sql` — project/section API layer + statuses
- `0008_subagents_memory_hub.sql` — subagents orchestration + memory hub tables
- `0009_projects_order_archive.sql` — project ordering + archive support
