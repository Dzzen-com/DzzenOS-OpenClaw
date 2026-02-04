# Agent-driven install (chat → install → reply)

Goal: a user can message their OpenClaw agent something like:

> "Install DzzenOS-OpenClaw"

…and the agent will:
1) install/update DzzenOS on the gateway host
2) publish the UI to the OpenClaw Canvas host
3) reply with a ready-to-click URL (and SSH tunnel instructions if remote)

## Copy/paste message (send to your agent)

Send **exactly this** to your OpenClaw agent:

```text
Install (or update) DzzenOS-OpenClaw on the gateway host you are running on.

Run this command on the host:

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash

If you want machine-readable output, you may use:

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --json

After it finishes, reply to me with:
1) "DzzenOS installed ✅" (or "DzzenOS updated ✅")
2) The SSH tunnel command I should run on my laptop if the gateway is remote:
   ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
3) The exact URLs to open:
   - OpenClaw Control UI: http://localhost:18789/ (append ?token=... if required)
   - DzzenOS UI: http://localhost:18789/__openclaw__/canvas/dzzenos/ (append ?token=... if required)

Do NOT expose the gateway publicly (no --bind 0.0.0.0).
Do NOT print secrets/tokens unless they are already present in the URL I provided.
```

### What “good” looks like (expected reply format)

```text
DzzenOS installed ✅

If your OpenClaw gateway is remote, run on your laptop:
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>

Open:
- Control UI: http://localhost:18789/?token=...
- DzzenOS UI:  http://localhost:18789/__openclaw__/canvas/dzzenos/?token=...
```

## Notes

- This works best when the agent has permission to run shell commands on the gateway host.
- If the agent is configured to require approvals for shell commands, it **will ask you to approve each step** (safe default).
- If you want the agent to be interactive, explicitly tell it: “Ask before you run anything that changes firewall/ports/Caddy config.”
- If the agent can’t run commands, do the manual install from `docs/INSTALL.md`.

## Domain mode (Caddy + TLS + login)

If you want access from anywhere via a custom domain, the installer can set up:
- Caddy reverse proxy (TLS certificate auto-issued)
- DzzenOS login page + cookie session
- Secure caching defaults

In chat, tell the agent:
- your domain (subdomain)
- that DNS A record is already pointing to the server IP
- what SSH port is used (if not 22)

Then ask it to run the same installer and choose domain mode.
