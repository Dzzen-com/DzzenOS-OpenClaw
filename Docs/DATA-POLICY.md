# DzzenOS Data Safety Policy

This policy defines hard rules for protecting local user data during upgrades.

## 1) Storage location

- Runtime SQLite data must live outside the git working tree by default.
- User data path is configurable via `DZZENOS_DATA_DIR` / `DZZENOS_DB_PATH` / `--db`.
- Install/update scripts must not require storing DB files inside the repo directory.

## 2) Upgrade behavior

- Upgrades must be additive-safe by default.
- Installer/update flow should target tagged GitHub releases (versioned), not moving branch heads.
- Legacy DB locations may be migrated automatically once, but never silently deleted if target already exists.
- Upgrade scripts must not run destructive repo cleanup commands (`git clean -fdx`, remove data dirs, etc.).

## 3) Migration safety

- Every migration run with pending SQL files must create a pre-migration backup snapshot.
- On migration failure, system must restore from that snapshot and fail closed.
- Migrations must execute in transactions where SQLite allows it.
- CI must run upgrade-path regression checks (including broken-migration restore behavior).

## 4) Destructive schema changes

- Direct destructive operations are forbidden unless they follow copy-and-verify flow:
  1. create new schema/table
  2. copy data
  3. validate row counts/constraints
  4. switch over
- Data drops should be deferred to a later cleanup migration, not combined with schema transition logic.

## 5) Backup retention

- Keep multiple snapshots by default (`DZZENOS_DB_BACKUP_KEEP`, default 10).
- Backup path is configurable (`DZZENOS_DB_BACKUP_DIR`).
- Operators should additionally run external filesystem/system backups for disaster recovery.
