---
name: dzzenos
description: "DzzenOS — Local-first OS layer for founders (boards, docs, agent packs, automations) running natively inside OpenClaw."
metadata:
  {
    "openclaw": {
      "emoji": "🧩",
      "requires": { "bins": ["node"] }
    }
  }
---

# DzzenOS (OpenClaw Skill)

This skill will provide:
- **Local UI** (Linear-like) for boards/tasks/docs
- **SQLite storage**
- **Automations** (n8n-like) using OpenClaw cron + webhooks
- **Curated Marketplace** (skills + agent packs)

> Status: scaffold (WIP). See repo `/docs/openclaw-native/`.

## Local HTTP API (SQLite)

A tiny local API lives at `skills/dzzenos/api/server.ts`.

### Start

From the repo root:

```bash
pnpm dzzenos:api
# or
node --experimental-strip-types skills/dzzenos/api/server.ts
```

Defaults:
- **Host:** `127.0.0.1`
- **Port:** `8787` (override via `--port` or `PORT` env)
- **DB:** `./data/dzzenos.db` (override via `--db`)

On first run it will:
1. Run SQLite migrations from `skills/dzzenos/db/migrations/`
2. Seed a **Default Workspace** + **Default Board** if the DB is empty

### CORS

For local UI development, CORS is enabled for origins:
- `http(s)://localhost:<any>`
- `http(s)://127.0.0.1:<any>`

### Endpoints

- `GET /boards` → list boards
- `GET /tasks?boardId=<id>` → list tasks for a board (if `boardId` omitted, uses the first board)
- `POST /tasks` → create task
  - body: `{ "title": "...", "description"?: "...", "boardId"?: "..." }`
- `PATCH /tasks/:id` → update task
  - body: `{ "status"?: "todo"|"doing"|"done"|"blocked", "title"?: "...", "description"?: "..."|null }`

Quick smoke test:

```bash
curl -s http://127.0.0.1:8787/boards | jq
```
