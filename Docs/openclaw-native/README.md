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

OpenClaw cron integration notes:
- DzzenOS does not run its own scheduler for heartbeat/standup.
- Use OpenClaw CLI as runtime bridge (`openclaw cron ...`).
- Optional env overrides for API:
  - `DZZENOS_OPENCLAW_BIN` (default: `openclaw`)
  - `DZZENOS_OPENCLAW_ARGS` (extra args, e.g. `-y openclaw@latest`)
