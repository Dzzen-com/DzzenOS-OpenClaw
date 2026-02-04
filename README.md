# DzzenOS

DzzenOS is a **local-first OS layer for founders** that runs **natively inside OpenClaw**.

It provides:
- Boards (Kanban + list views) — **Linear-like UX**
- Task cards with **agent chat sessions**, runs, artifacts, approvals
- Docs / Memory (Obsidian-lite)
- Automations (n8n-like): cron / webhooks / manual triggers
- Curated marketplace: **Official / Verified / Community** skills + agent packs

## Quick start (dev / testers)

### 1) Clone
```bash
git clone https://github.com/Dzzen-com/DzzenOS.git
cd DzzenOS
```

### 2) Install DzzenOS skill into your OpenClaw workspace
Until we publish to ClawHub, install from source:

```bash
# from your OpenClaw workspace root
mkdir -p skills
cp -R /path/to/DzzenOS/skills/dzzenos ./skills/dzzenos

# restart OpenClaw session so it picks up the new skill
```

## Logging / Debugging
We will ship a **built-in logs panel** in the UI.

When filing bugs, include:
- DzzenOS version
- OpenClaw version (`openclaw status`)
- reproduction steps
- relevant DzzenOS logs (redact secrets)

## Roadmap (OpenClaw Native)
See docs:
- `/docs/openclaw-native/` (English)

## Contributing
- English-only issues and PRs.
- Please use the issue templates.

## License

This project is **source-available** under the **Business Source License 1.1 (BUSL-1.1)**.

- Free production use for organizations with **Annual Gross Revenue < USD 1,000,000** (see the Additional Use Grant in `LICENSE`).
- For companies ≥ $1M revenue and/or prohibited use-cases (hosted/managed service, resale/rebrand), a commercial license is required.

See: `LICENSE`, `docs/licensing.md`, and `TRADEMARKS.md`.
