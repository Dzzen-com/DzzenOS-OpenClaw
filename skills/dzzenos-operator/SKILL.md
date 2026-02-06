---
name: dzzenos-operator
description: "Operate DzzenOS boards and tasks via the local API (create/move/update/summarize)."
metadata:
  {
    "openclaw": {
      "emoji": "🧭",
      "requires": { "bins": ["curl"] }
    }
  }
---

# DzzenOS Operator (OpenClaw Skill)

Use this skill to control DzzenOS from chat (Slack/Telegram/OpenClaw UI).

## API Base
Default: `http://127.0.0.1:8787`

If the user has a domain install, use the domain base and include any `?token=` they give you.

## Common actions

### List boards
```bash
curl -s http://127.0.0.1:8787/boards
```

### Create task
```bash
curl -s http://127.0.0.1:8787/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Ship landing page","boardId":"<board-id>","status":"ideas"}'
```

### Move task to In progress
```bash
curl -s http://127.0.0.1:8787/tasks/<task-id> \
  -X PATCH -H 'content-type: application/json' \
  -d '{"status":"doing"}'
```

### Plan task (agent session)
```bash
curl -s http://127.0.0.1:8787/tasks/<task-id>/run \
  -X POST -H 'content-type: application/json' \
  -d '{"mode":"plan"}'
```

### Chat with task agent
```bash
curl -s http://127.0.0.1:8787/tasks/<task-id>/chat \
  -X POST -H 'content-type: application/json' \
  -d '{"text":"Please refine the plan"}'
```

### Mark Done
```bash
curl -s http://127.0.0.1:8787/tasks/<task-id> \
  -X PATCH -H 'content-type: application/json' \
  -d '{"status":"done"}'
```

## Notes
- Status flow: `ideas → todo → doing → review → release → done → archived`.
- Moving to `doing` auto-starts execution.
- When task is marked `done`, summary is appended to docs/changelog/memory.
