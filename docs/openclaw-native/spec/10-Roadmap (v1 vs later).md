# DzzenOS (OpenClaw Native) — Roadmap (v1 vs later)

Этот roadmap относится к **OpenClaw Native (local-first)** версии DzzenOS.

---

## V1 (первая версия) — must have
Цель: чтобы DzzenOS реально работал как «операционка» для фаундера и контента.

### 1) Linear-like UI (основа)
- Board: kanban + list views
- Task drawer: brief + chat + runs/artifacts + approvals
- Command palette (Ctrl+K) + базовые hotkeys

### 2) Docs (Obsidian-lite) + Context packs
- Workspace docs (общие)
- Board docs (контекст домена)
- Attach docs к task
- Pinned docs (workspace) + default docs (board)

### 3) Agent Packs & Squads (минимум 1–2 пакета)
- Content Squad: writer → editor → social packager
- Founder Ops: planning/review/digest
- UI выбора pack на board/task

### 4) Runs / Artifacts / Approvals — first-class
- run history + статусы + retry
- artifacts preview (md/diff/json)
- approvals (approve/reject) для опасных действий

### 5) Automations (n8n-like) MVP
- Визуальный редактор (React Flow)
- Triggers: manual + cron (OpenClaw cron) + webhook (HMAC)
- Ноды: Agent Squad, Condition, JS Transform (sandbox), Notify
- Run logs (step-by-step) + дебаг

### 6) Marketplace (curated) MVP
- вкладки: Official / Verified / Community
- установка/обновление skills + policy presets
- вкладка Agent Packs (Official)

---

## Позже (v2+) — обязательно

### A) Sync / Backup / Portability
- экспорт/импорт workspace
- backup/restore
- multi-device sync (опционально, encrypted)

### B) Стоимость/лимиты/наблюдаемость
- cost tracking per run/automation
- budgets + alerts
- rate limits, retries, dedupe webhooks

### C) Библиотека нод и интеграций
- GitHub, RSS, Stripe, Notion/Docs, DB connectors
- browser-based steps (через approvals)

### D) Версионирование
- versioning docs
- versioning automation graphs
- versioning agent packs
- schema migrations SQLite

### E) Командный режим (если понадобится)
- роли/права
- шаринг workspace

### F) Публикация контента end-to-end
- scheduled publishing
- multi-platform posting
- approval-first publishing

---

## Принцип приоритезации
- V1: «работает из коробки» и даёт value за 5 минут.
- V2+: масштабируемость, синк, расширение экосистемы.
