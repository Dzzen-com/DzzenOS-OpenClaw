# Install (release-first)

Default installer behavior:
- installs from the **latest GitHub release**
- keeps rollback snapshots
- publishes UI to OpenClaw Canvas

## Quick install/update

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

## Pin exact version

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --version v1.2.3
```

## Machine-readable output

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --json
```

## Rollback

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --rollback
```

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

## Related docs

- `docs/INSTALL-MODES.md`
- `docs/DOMAIN-ACCESS.md`
- `docs/AGENT-INSTALL.md`
