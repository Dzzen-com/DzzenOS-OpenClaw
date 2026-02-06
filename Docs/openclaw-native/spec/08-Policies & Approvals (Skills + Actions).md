# DzzenOS (OpenClaw Native) — Policies & Approvals (Skills + Actions)

Цель: сделать безопасную “операционку”:
- agents могут делать много
- но действия «наружу» и опасные операции проходят через approvals
- навыки/инструменты (skills/tools) включаются политиками на разных уровнях

---

## 0) Главный принцип
**По умолчанию запрещено всё опасное.**

Мы разрешаем:
- чтение/генерацию контента
- планирование/создание задач

Мы запрещаем без апрува:
- публикации
- рассылки
- любые необратимые изменения

---

## 1) Уровни политики

### 1.1 Workspace policy (глобальная)
Определяет базовые ограничения для всего workspace.
Примеры:
- какие skills можно устанавливать
- можно ли сети
- максимальные лимиты на “дорогие” агенты

### 1.2 Board policy (доменные правила)
Board = контейнер политики.
Примеры:
- Content board: разрешены content tools, запрещены deploy tools
- Founder Ops: разрешены email/calendar, но через approvals

### 1.3 Task override (редко)
Переопределение политики на уровне одной карточки.
Требование: override должен быть явным и логироваться.

---

## 2) Что такое policy (структура)
MVP структура (json):

```json
{
  "tools": {
    "mode": "allowlist",
    "allow": ["dzzen.*", "message.send", "browser.*"],
    "deny": ["nodes.*"],
    "requireApproval": ["message.send", "browser.act"]
  },
  "externalActions": {
    "requireApproval": true,
    "categories": {
      "publish": true,
      "send_email": true,
      "post_social": true
    }
  },
  "limits": {
    "maxRunsPerHour": 20,
    "maxCostPerRun": null
  }
}
```

Примечание:
- `tools.allow/deny` — список tool patterns
- `tools.requireApproval` — tool patterns, которые можно только через approval

---

## 3) Approvals

### 3.1 Что такое approval
Approval = объект, который блокирует выполнение опасного шага.

Поля (внутренняя модель, SQLite/DB):
- `id`, `task_id`, `run_id` (опц.)
- `kind`: publish/send_email/post_social/spend_budget/update_docs/other
- `status`: pending/approved/rejected/canceled
- `payload`: что именно будет сделано (структурировано)
- `created_at`, `decided_at`, `decision_by`

### 3.2 Как approval используется в автоматизациях
Automation step может:
- создать approval
- ждать approval
- после approve выполнить действие

---

## 4) Пресеты политик (MVP)

### 4.1 Content Board preset (строгий)
Цель: писать контент локально, а публиковать только после approve.

- allow: генерация текста, чтение docs, создание артефактов
- require approval:
  - любые “post/publish” skills
  - message.send в публичные каналы
  - browser automation, если это публикация

### 4.2 Founder Ops preset
Цель: помогать фаундеру, но не совершать необратимых действий.

- allow: создание задач, напоминания, дайджесты
- approvals:
  - email send
  - любые изменения “внешних систем”

---

## 5) Логирование и аудит
Нужно логировать:
- смену политики (workspace/board/task)
- попытки запрещённых действий
- все approvals и решения

---

## 6) Связь с маркетплейсом
Marketplace должен показывать:
- какие capabilities у skill
- какие approvals он требует
- какие presets доступны для boards

MVP: у Official skills всегда есть presets.
