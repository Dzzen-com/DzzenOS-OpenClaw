# DzzenOS (OpenClaw Native) — Epics (v1)

Формат: Epic → Outcome → ключевые deliverables.

---

## EPIC 1 — Linear-like UI shell
**Outcome:** быстрый интерфейс: boards + task drawer.

Deliverables:
- Workspaces/Boards navigation
- Kanban + list view
- Task drawer: brief/chat/runs/artifacts/approvals
- Ctrl+K palette

---

## EPIC 2 — Docs & Context Packs
**Outcome:** docs работают как память и реально улучшают выполнение задач.

Deliverables:
- Workspace docs (markdown)
- Board docs (markdown)
- Attach docs to task
- Pinned/default docs
- Context pack viewer на карточке

---

## EPIC 3 — Agent Packs & Squads
**Outcome:** один клик → качественный результат.

Deliverables:
- Agent Packs model (SQLite)
- Content Squad v1
- Founder Ops Pack v1
- UI выбора pack на board/task

---

## EPIC 4 — Runs/Artifacts/Approvals
**Outcome:** безопасное выполнение и прозрачные результаты.

Deliverables:
- run lifecycle + retry
- artifacts storage + preview
- approvals create/wait/approve/reject
- audit log (минимально)

---

## EPIC 5 — Automations (n8n-like) MVP
**Outcome:** пользователь собирает flow, агент тоже может собрать flow.

Deliverables:
- React Flow editor
- Trigger types: manual/cron/webhook
- Node types: Agent Squad / Condition / JS Transform / Notify
- Execution engine + step logs
- OpenClaw cron bridge

---

## EPIC 6 — Marketplace (curated) MVP
**Outcome:** расширяемость через skills без хаоса.

Deliverables:
- curated index (official/verified/community)
- install/update/disable flow
- policy presets per skill
- Agent Packs tab (official)
