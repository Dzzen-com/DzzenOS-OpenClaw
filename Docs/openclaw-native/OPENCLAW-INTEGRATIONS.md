# OpenClaw integrations we leverage

DzzenOS-OpenClaw is designed to **stand on OpenClaw primitives** (skills, cron, sessions, memory) instead of rebuilding them.

## Agents dashboard (OpenClaw Web UI)
OpenClaw `v2026.2.2` introduced an **Agents dashboard** for managing:
- agent files
- tools
- skills
- models
- channels
- cron jobs

How we use it in v1:
- DzzenOS focuses on **Boards/Tasks/Runs/Approvals/Automations UX**.
- For "admin" operations (editing agent files, enabling skills, viewing cron jobs) we can temporarily rely on OpenClaw’s dashboard.

This helps us ship faster without duplicating control-plane UI.

## Memory backend (QMD, optional)
OpenClaw `v2026.2.2` added an opt-in **QMD memory backend** (PR #3160).

Why it matters for DzzenOS:
- faster/stronger search over large workspaces
- better citations and retrieval behavior

Our approach:
- v1: DzzenOS uses OpenClaw memory tools for retrieval.
- later: we can add a DzzenOS UI diagnostic to show which memory backend is active and recommended settings.

