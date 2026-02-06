# Install (release-first)

Default installer behavior:
- installs from the **latest GitHub release**
- keeps rollback snapshots
- publishes UI to OpenClaw Canvas

Under the hood each run performs:
- preflight checks (Node, curl, tar, corepack)
- release resolution (`latest` or pinned tag)
- source tarball fetch + SHA-256 calculation
- atomic release activation with rollback snapshot retention
- dependency install + UI build/publish

## Quick install/update

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

## Pin exact version

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --version v1.2.3
```

Use pinned versions for production/CI environments.

## Machine-readable output

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --json
```

`--json` is recommended for agent automation and scripted install pipelines.

## Rollback

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --rollback
```

Rollback snapshots are stored in `<install-dir>.state/rollbacks/`.

## Typical remote flow (SSH tunnel)

1) On server, install/update DzzenOS:
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

2) On laptop, create tunnel:
```bash
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
```

3) Open:
- Control UI: `http://localhost:18789/` (append `?token=...` if required)
- DzzenOS UI: `http://localhost:18789/__openclaw__/canvas/dzzenos/` (append `?token=...` if required)

## Useful flags

- `--mode auto|local|server|docker|cloudflare`
- `--ui-profile local|domain`
- `--domain <example.com>`
- `--domain-email <mail>`
- `--username <name>`
- `--password <pass>`
- `--no-domain`
- `--keep-rollbacks <n>`
- `--install-dir <path>`
- `--yes`

## Verification and audit notes

- Installer always computes SHA-256 of downloaded release source tarball and shows it in the final summary.
- Installer records current version and source hash in `<install-dir>.state/`.
- Installer keeps rollback snapshots in `<install-dir>.state/rollbacks/`.
- For full operational details, see `Docs/RELEASE-OPERATIONS.md`.

## Data safety operations

List DB backups:
```bash
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup list
```

Create DB backup:
```bash
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup create --name pre-change
```

Restore DB backup:
```bash
bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup restore --file <backup.sqlite>
```

Important:
- DzzenOS DB and workspace files are stored in OS data directories, not in OpenClaw state dir by default.
- In server/domain mode, `DZZENOS_DATA_DIR` defaults to `/var/lib/dzzenos-openclaw`.

## Related docs

- `Docs/INSTALL-MODES.md`
- `Docs/DOMAIN-ACCESS.md`
- `Docs/AGENT-INSTALL.md`
- `Docs/RELEASE-OPERATIONS.md`
