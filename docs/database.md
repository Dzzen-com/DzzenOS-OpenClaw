# Database (SQLite)

DzzenOS is **local-first**. The MVP stores its core entities in a single **SQLite** file.

See also: `docs/DATA-POLICY.md`.

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
- `task_sessions` (agent session per task)
- `task_checklist_items`
- `task_messages` (chat cache)
- `agent_runs`
- `run_steps`
- `approvals` (`pending` / `approved` / `rejected`)
- `artifacts` (metadata only)
- `agents`
- `automations`
