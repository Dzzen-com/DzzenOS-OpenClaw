<h1 align="center">DzzenOS-OpenClaw</h1>

<p align="center">
  <a href="https://github.com/Dzzen-com/DzzenOS-OpenClaw/releases"><img src="https://img.shields.io/github/v/release/Dzzen-com/DzzenOS-OpenClaw?include_prereleases&sort=semver" alt="Release" /></a>
  <a href="https://github.com/Dzzen-com/DzzenOS-OpenClaw/stargazers"><img src="https://img.shields.io/github/stars/Dzzen-com/DzzenOS-OpenClaw?style=flat" alt="Stars" /></a>
  <a href="https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues"><img src="https://img.shields.io/github/issues/Dzzen-com/DzzenOS-OpenClaw" alt="Issues" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-BUSL--1.1-blue" alt="License" /></a>
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/OpenClaw-native-111827" alt="OpenClaw" /></a>
</p>

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

## Install

### Option A — Remote (server)

**1) On your server: run installer**
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
```

**2) On your laptop: create an SSH tunnel**
```bash
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
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

---

## Docs

- Install (SSH tunnel): [docs/INSTALL.md](docs/INSTALL.md)
- Domain mode (Caddy + TLS + login + caching): [docs/DOMAIN-ACCESS.md](docs/DOMAIN-ACCESS.md)
- Agent-driven install: [docs/AGENT-INSTALL.md](docs/AGENT-INSTALL.md)
- Remote access notes: [docs/remote-access.md](docs/remote-access.md)

- OpenClaw Native specs (EN): [docs/openclaw-native/spec/](docs/openclaw-native/spec/)

Start here: [docs/openclaw-native/README.md](docs/openclaw-native/README.md)

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
- Use the [issue templates](.github/ISSUE_TEMPLATE/) for bugs and feature requests; for questions and open-ended ideas, use [Discussions](https://github.com/Dzzen-com/DzzenOS-OpenClaw/discussions).

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Brand

DzzenOS-OpenClaw is part of **Dzzen** — a unified space for solo founders.

If you fork this project, you must follow the trademark policy:
- [TRADEMARKS.md](TRADEMARKS.md)

---

## License

This project is **source-available** under the **Business Source License 1.1 (BUSL-1.1)**.

- Free production use for organizations with **Annual Gross Revenue < USD 1,000,000** (see [Additional Use Grant](docs/licensing/ADDITIONAL-GRANT.md) in [LICENSE](LICENSE)).
- For companies ≥ $1M revenue and/or prohibited use-cases (hosted/managed service, resale/rebrand), a commercial license is required.

See: [LICENSE](LICENSE), [docs/licensing.md](docs/licensing.md), [docs/licensing/ADDITIONAL-GRANT.md](docs/licensing/ADDITIONAL-GRANT.md), and [TRADEMARKS.md](TRADEMARKS.md).
