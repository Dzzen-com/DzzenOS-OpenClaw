# DzzenOS (OpenClaw Native) Docs

This folder is the **English** spec for the first open-source release.

Path note:
- Product documentation now lives under root `Docs/` for docs-platform publishing.

- Main specs: `./spec/`
- Optional Russian duplicates (for the website): `./spec-ru/`

Recommended reading order:
- `spec/INDEX.md`

Implementation notes:
- `PROJECT-AGENT-ARCHITECTURE.md`
- `DEV-STATUS-WIDE-V1.md` (current implementation status + deferred tracks)

OpenClaw cron integration notes:
- DzzenOS does not run its own scheduler for heartbeat/standup.
- Use OpenClaw CLI as runtime bridge (`openclaw cron ...`).
- Optional env overrides for API:
  - `DZZENOS_OPENCLAW_BIN` (default: `openclaw`)
  - `DZZENOS_OPENCLAW_ARGS` (extra args, e.g. `-y openclaw@latest`)

Deferred external channels tracker:
- [Issue #79](https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues/79) — channel actions
- [Issue #80](https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues/80) — governance & approvals
- [Issue #81](https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues/81) — reliability + e2e
