# DzzenOS (OpenClaw Native) — Automations (n8n-like)

Цель: локальный (SQLite) конструктор автоматизаций **по аналогии с n8n**, но нативно для DzzenOS/OpenClaw:
- визуальные ноды
- agent-ноды как отдельные сессии
- JS code-ноды (sandbox)
- триггеры: cron / webhook / manual
- approvals для опасных действий

---

## 0) Дизайн‑принципы
1) **Local-first**: definitions + run logs в SQLite.
2) **Deterministic edges**: у каждой ноды строгий контракт вход/выход.
3) **Observability**: execution trace, step logs, error handling, retries.
4) **Security-first**: webhooks подписаны; JS sandbox; external actions через approvals.

---

## 1) Что такое Flow
Flow = {trigger} + DAG нод (nodes/edges) + политика исполнения.

### 1.1 Сущности в UI
- Automation (flow)
- Node (шаг)
- Connection (edge)
- Run (запуск)

---

## 2) Триггеры

### 2.1 Cron trigger
Вариант A (рекомендую для OpenClaw Native): использовать **OpenClaw Gateway cron** как scheduler.
- cron живёт в gateway (персистентно, переживает рестарты)
- job payload вызывает DzzenOS automation run

Плюсы:
- не пишем свой планировщик
- единая точка расписаний в OpenClaw

Минусы:
- нужно обеспечить “bridge”: cron → DzzenOS

### 2.2 Webhook trigger
DzzenOS поднимает локальный HTTP endpoint:
- `POST /dzzenos/hooks/<hook_id>`

Защита:
- HMAC подпись: `X-DzzenOS-Signature`
- timestamp + nonce (защита от replay)
- rate limit

Внешний запуск (из интернета) — опционально:
- через Cloudflare Tunnel/NGROK
- или через reverse proxy пользователя

### 2.3 Manual trigger
Кнопка “Run” в UI.

---

## 3) Ноды (MVP набор)

### 3.1 Core
- **Condition / Switch** (ветвление)
- **JS Transform** (sandbox, без сети/FS)
- **Delay**
- **HTTP Request** (опционально; по policy)

### 3.2 DzzenOS domain
- Create/Update Task
- Move Task
- Read/Write Doc
- Create Approval / Wait Approval
- Notify (через OpenClaw message tool / канал)

### 3.3 Agent node (ключевая)
AgentNode запускает отдельную сессию агента и возвращает результат.

Параметры:
- agent_profile (какой профиль)
- input mapping (что передать в промпт)
- context pack (workspace docs / board docs / attachments)
- output schema (json schema или “free text + artifacts”)
- policy (tools allowlist/denylist)

Выход:
- `{ text, json?, artifacts?, citations?, cost? }`

---

## 4) JS Code node: sandbox
Требования:
- доступ только к input data и helper utils
- лимит времени выполнения
- без доступа к сети/файлам

MVP: JS только для преобразования данных (map/filter/format).

---

## 5) Модель данных (SQLite) — предложение

### 5.1 `automations`
- `id` (int PK)
- `public_id` (uuid)
- `workspace_id`
- `name`
- `enabled` (bool)
- `trigger_kind` (cron|webhook|manual)
- `trigger_config` (json)
- `graph` (json: nodes+edges)
- `created_at`, `updated_at`

### 5.2 `automation_runs`
- `id`, `public_id`
- `automation_id`
- `status` (queued|running|success|fail|canceled)
- `started_at`, `finished_at`
- `input` (json)
- `output` (json)
- `error` (text/json)

### 5.3 `automation_run_steps`
- `id`
- `run_id`
- `node_id` (string)
- `status`
- `started_at`, `finished_at`
- `input` (json)
- `output` (json)
- `logs` (text)
- `error` (text)

---

## 6) Как агент “собирает автоматизацию”
Делаем отдельный agent_profile: **Automation Builder**.

Флоу:
1) пользователь описывает задачу ("каждый день в 9:00 делать дайджест и создавать таски")
2) агент генерит graph JSON + краткое описание
3) человек подтверждает/правит
4) сохраняем

Важно:
- генерация должна быть идемпотентной
- человек всегда может “открыть и поправить” руками

---

## 7) Как организовать cron: OpenClaw cron vs свой
Рекомендация: **использовать OpenClaw cron как scheduler**, а DzzenOS хранит только определения flow.

Механика:
- при включении automation с cron trigger → создаём job в OpenClaw cron
- job payload вызывает “run automation <id>”
- при выключении → disable/remove job

Так у нас единый планировщик, и мы избегаем дублирования.
