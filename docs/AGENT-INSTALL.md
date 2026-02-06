# Agent-driven install (chat -> install -> reply)

Goal: a user asks OpenClaw agent to install/update DzzenOS and return ready links.

## Copy/paste message (send to your agent)

```text
Install (or update) DzzenOS-OpenClaw on the gateway host you are running on.

Run this command on the host:

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash

If I ask for a specific version, use:

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --version <tag>

If I ask for machine-readable output, use:

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --json

After it finishes, reply with:
1) "DzzenOS installed ✅" or "DzzenOS updated ✅"
2) SSH tunnel command for laptop if gateway is remote:
   ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
3) URLs to open:
   - OpenClaw Control UI: http://localhost:18789/ (append ?token=... if required)
   - DzzenOS UI: http://localhost:18789/__openclaw__/canvas/dzzenos/ (append ?token=... if required)

If rollback is requested, run:

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --rollback

Do NOT expose gateway publicly (no --bind 0.0.0.0).
Do NOT print secrets unless already present in URL.
```

## Notes

- Installer is release-first (latest GitHub release by default).
- Domain setup is available in `server` mode.
- For manual domain setup details see `docs/DOMAIN-ACCESS.md`.
