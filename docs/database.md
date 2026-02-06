# Database (SQLite)

DzzenOS is **local-first**. The MVP stores its core entities in a single **SQLite** file.

## Migrations

Migrations are plain SQL files in:

- `skills/dzzenos/db/migrations/*.sql`

Applied migrations are tracked in `schema_migrations`.

### Run migrations

From the repo root:

```bash
# Default DB path: ./data/dzzenos.db
node --experimental-strip-types skills/dzzenos/db/migrate.ts

# Or specify a DB path
node --experimental-strip-types skills/dzzenos/db/migrate.ts --db ./data/dzzenos.dev.db

# Or specify a custom migrations folder
node --experimental-strip-types skills/dzzenos/db/migrate.ts --migrations ./somewhere/migrations --db ./data/dzzenos.db
```

## MVP schema (v1)

Entities included:

- `workspaces`
- `boards`
- `tasks`
- `task_context_items` (task-level context pack items)
- `agent_runs`
  - includes `config_snapshot_json` (resolved immutable run config)
- `run_steps`
- `approvals` (`pending` / `approved` / `rejected`)
- `artifacts` (metadata only)
- `agents` (roster + profile config: model/tools/policy/skills/guardrails)
