# Install (remote server via SSH tunnel)

This is the simplest, most secure setup when OpenClaw runs on a remote host (droplet) but you want to use the UI on your laptop.

## 0) Prereqs

- OpenClaw Gateway running on the server (loopback bind recommended)
- On your laptop: SSH access to the server

## 1) Create SSH tunnel (laptop → server)

```bash
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
```

Then OpenClaw Control UI is available at:
- `http://localhost:18789/` (append `?token=...` if required)

## 2) Install DzzenOS-OpenClaw (server)

SSH into the server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

During install you can choose:
- **SSH tunnel mode** (this guide)
- **Domain mode** (Caddy + TLS + login page) — see `docs/DOMAIN-ACCESS.md`

Machine-readable output (for automation):

```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --json
```

What it does:
- clones/updates the repo
- installs deps
- builds the UI
- publishes it to OpenClaw Canvas host

## 3) Open DzzenOS UI (laptop)

Open:
- `http://localhost:18789/__openclaw__/canvas/dzzenos/` (append `?token=...` if required)

---

## Notes

- This method does **not** expose public ports.
- It does **not** require VPN/Tailscale.
- For local-first use on a laptop, install OpenClaw + DzzenOS locally instead (future guide).

### Task Chat MVP

The Task Drawer **Chat** tab uses the OpenClaw Gateway as the backend and expects an OpenAI-compatible OpenResponses endpoint at:

- `/__openclaw__/openresponses/v1/chat/completions`

If your gateway doesn’t expose this endpoint, the Chat tab will show an error.


## Agent-driven install

If you want to trigger installation from chat (agent runs the commands and replies with the link), see: `docs/AGENT-INSTALL.md`.
