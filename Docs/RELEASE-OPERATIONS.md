# Release and Operations

This page documents the release-first installer behavior, rollback flow, and operational commands.

## Release-first install model

DzzenOS installer (`scripts/install.sh`) does not deploy from a moving branch head by default.

Default flow:

1. Resolve release metadata from GitHub API (`latest` or `--version <tag>`).
2. Download release source tarball.
3. Compute SHA-256 of the downloaded payload (always printed in installer summary).
4. Validate payload structure before activation.
5. Move previous install to rollback snapshot.
6. Activate new release and write release metadata files.
7. Install deps, build UI, publish to OpenClaw Canvas.

Release metadata files:

- `<install-dir>/.dzzenos-release-tag`
- `<install-dir>/.dzzenos-release-meta.json`
- `<install-dir>.state/current-version`
- `<install-dir>.state/current-source-sha256`

## Installer commands

Install/update latest:

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

Pin exact version:

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --version v1.2.3
```

Rollback:

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --rollback
```

Machine-readable mode:

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --json
```

## Rollback behavior

Rollback snapshots are kept in:

- `<install-dir>.state/rollbacks/`

On upgrade/install:

- Current install is moved to a timestamped snapshot.
- New release is activated.
- Snapshot retention is controlled by `--keep-rollbacks` / `KEEP_ROLLBACKS`.

On rollback:

- Installer restores the newest snapshot.
- Current install is moved to a `rollback-from-*` snapshot.

## Data location behavior

SQLite and workspace files are not tied to repo path by default.

Default data roots:

- Linux: `~/.local/share/dzzenos-openclaw/`
- macOS: `~/Library/Application Support/DzzenOS-OpenClaw/`
- Windows: `%APPDATA%/DzzenOS-OpenClaw/`

Server domain setup default:

- `DZZENOS_DATA_DIR=/var/lib/dzzenos-openclaw`

Legacy data migration:

- Old DB path (`./data/dzzenos.db`) is moved once to new default location when applicable.
- Old workspace dir (`./data/workspace`) is moved once to new default location when applicable.

## Backup and restore operations

List backups:

```bash
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup list
```

Create backup:

```bash
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup create --name pre-change
```

Restore backup:

```bash
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup restore --file <backup.sqlite>
```

Direct CLI usage:

```bash
node --experimental-strip-types skills/dzzenos/db/backup.ts create --db /path/to/dzzenos.db
node --experimental-strip-types skills/dzzenos/db/backup.ts list --db /path/to/dzzenos.db
node --experimental-strip-types skills/dzzenos/db/backup.ts restore --db /path/to/dzzenos.db --file /path/to/backup.sqlite
```

## Migration safety

Migration runner guarantees:

- `PRAGMA integrity_check` before applying pending migrations.
- Pre-migration snapshot backup for existing DB.
- Transactional migration execution.
- Auto-restore from pre-migration backup on failure.
- Backup rotation via `DZZENOS_DB_BACKUP_KEEP`.

## CI safety checks

CI runs upgrade-path regression checks:

- full migration bootstrap
- idempotent second migration run
- failed migration restore scenario

Entry point:

- `node scripts/test-migrations.mjs`
