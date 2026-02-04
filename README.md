# DzzenOS-OpenClaw

<p align="center">
  <img src="./assets/hero-placeholder.svg" alt="DzzenOS-OpenClaw hero" width="900" />
</p>

<p align="center">
  <b>A local-first OS layer for solo founders — running natively inside OpenClaw.</b>
  <br/>
  Boards • Tasks • Agents • Approvals • Automations • Marketplace
</p>

---

## Why this exists (the pain)

If you’re building as a solo founder, you’re constantly fighting:

- **Fragmented execution**: notes in one app, tasks in another, automation in a third.
- **No reliable “agent ops”**: you can run agents, but you can’t easily see what’s running, what’s stuck, and what needs approval.
- **Tooling overhead**: SaaS control planes add complexity, latency, and lock-in.

**DzzenOS-OpenClaw** turns OpenClaw into a **founder OS**: a single, local-first workspace where agent work becomes visible, reviewable, and repeatable.

## What it is

DzzenOS-OpenClaw is a **skill + UI + local database** that runs on your hardware (local-first).

It provides:
- **Boards & tasks** (Kanban + lists) with a **Linear-like UX**
- **Task cards** with agent sessions, runs, artifacts, approvals
- **Docs / Memory** (Obsidian-lite)
- **Automations** (n8n-like): cron / webhooks / manual triggers
- **Curated marketplace** for skills + **agent packs**

## What it is NOT
- Not a hosted SaaS control plane.
- Not a fork of n8n.
- Not trying to replace OpenClaw — it’s an OS layer **inside** OpenClaw.

---

## 3-minute quickstart (local demo)

**Prereqs:** Node.js (>= 22 recommended). We use **Corepack** to provide pnpm.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Then open the UI printed in the console (default: `http://127.0.0.1:5173`).

What you can try in ~1 minute:
1. Create a task.
2. Click **Simulate run** (dev-only) to create a run + steps.
3. Refresh the task to see the run advance.

### Ports / collisions
- API defaults to `127.0.0.1:8787`
- UI defaults to `127.0.0.1:5173`

If a default port is already in use, `pnpm dev` will automatically pick the next free port and print it.

You can override:
```bash
HOST=127.0.0.1 API_PORT=8787 UI_PORT=5173 pnpm dev
```

---

## Install

### Option A — Remote (server) via SSH tunnel (fastest)

**1) On your laptop: create an SSH tunnel**
```bash
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
```

**2) On your server: run installer**
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

**3) Open in your browser**
- DzzenOS UI: `http://localhost:18789/__openclaw__/canvas/dzzenos/` (append `?token=...` if required)
- Control UI: `http://localhost:18789/` (append `?token=...` if required)

### Option B — Domain (Caddy + TLS + login) (best UX)

This gives you access from anywhere (phone/laptop) at:
- `https://<your-domain>/login`
- `https://<your-domain>/dashboard`

Run the same installer and choose **server/VPS** → **domain mode**.

Docs: `docs/DOMAIN-ACCESS.md`

### Agent-driven install (chat → install → reply)

See: `docs/AGENT-INSTALL.md`

### More details

- `docs/INSTALL.md`
- `docs/remote-access.md`

## Install (alpha)

Until we publish to ClawHub, install from source.

### 1) Clone
```bash
git clone https://github.com/Dzzen-com/DzzenOS-OpenClaw.git
cd DzzenOS-OpenClaw
```

### 2) Copy the DzzenOS skill into your OpenClaw workspace
```bash
# from your OpenClaw workspace root
mkdir -p skills
cp -R /path/to/DzzenOS-OpenClaw/skills/dzzenos ./skills/dzzenos

# restart OpenClaw so it picks up the new skill
```

---

## Docs

## Remote access (server → laptop)

### Option A — SSH tunnel (no domain)

If you run OpenClaw on a remote server, use an SSH tunnel:

```bash
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
```

DzzenOS UI can be served via OpenClaw Canvas host:

```bash
corepack pnpm dzzenos:canvas:publish
```

Open:
- `http://localhost:18789/__openclaw__/canvas/dzzenos/` (append `?token=...` if your gateway requires it)

### Option B — Domain (Caddy + TLS + login)

If you want to access from anywhere (phone/laptop) via a custom domain:

- Use the installer and enable **domain access**.
- You'll need a DNS **A record** pointing your subdomain to the server public IP.

Docs:
- `docs/DOMAIN-ACCESS.md`


- OpenClaw Native specs (EN): `docs/openclaw-native/spec/`
- Optional RU duplicates (for the website): `docs/openclaw-native/spec-ru/`

Start here: `docs/openclaw-native/README.md`

## Logging / debugging

We plan to ship a **built-in logs panel** in the UI.

When filing bugs, include:
- DzzenOS-OpenClaw version (commit SHA is ok)
- OpenClaw version (`openclaw status`)
- reproduction steps
- relevant DzzenOS logs (redact secrets)

---

## Roadmap

See `docs/openclaw-native/spec/10-Roadmap (v1 vs later).md`.

We track work in GitHub Issues + Project Board.

---

## Contributing

- **English-only** issues and PRs.
- Use the issue templates.

See `CONTRIBUTING.md`.

---

## Brand

DzzenOS-OpenClaw is part of **Dzzen** — a unified space for solo founders.

If you fork this project, you must follow the trademark policy:
- `TRADEMARKS.md`

---

## License

This project is **source-available** under the **Business Source License 1.1 (BUSL-1.1)**.

- Free production use for organizations with **Annual Gross Revenue < USD 1,000,000** (see the Additional Use Grant in `LICENSE`).
- For companies ≥ $1M revenue and/or prohibited use-cases (hosted/managed service, resale/rebrand), a commercial license is required.

See: `LICENSE`, `docs/licensing.md`, and `TRADEMARKS.md`.
