# DzzenOS (OpenClaw Native) — Chat Bindings (Telegram Topics + Slack Threads)

Цель: привязать **доску** (board) к **треду/топику** в мессенджере (Telegram topics / Slack threads / Discord threads), чтобы:
- управлять доской/карточками из чата
- получать отчёты о выполнении задач и run’ов
- не ломать «внутренние» task sessions (чат в карточке)

---

## 0) Ключевая идея
**Chat thread = control plane**, **Task session = execution room**.

- Chat thread (топик/тред) — панель управления: команды, дайджесты, отчёты.
- Task session — отдельная сессия агента, где он думает/выполняет.

В чат мы постим только:
- summary
- ссылки на карточку/артефакты
- запросы на approve

---

## 1) Что привязываем

### 1.1 Board → Chat Thread binding
Привязка хранится на уровне board.

Поддерживаемые провайдеры:
- Telegram: group chat + topic (`message_thread_id`)
- Slack: channel + thread_ts
- Discord: channel + thread_id

Режимы:
- `control_only` — только команды
- `control_plus_reports` — команды + отчёты

---

## 2) Команды из чата (MVP)

### 2.1 Создание задач
- "создай задачу <текст>" → `dzzen.tasks_create` в board
- опционально: `priority`, `domain`, `pack`

### 2.2 Статус доски
- "статус" → количество задач по статусам + top N in progress

### 2.3 Движение задач
- "перемести <id/slug> в Review" → `dzzen.tasks_move`

### 2.4 Запуск агента/сквада
- "запусти <id>" → `dzzen.runs_start` (board default pack)
- "запусти <id> pack=Content" → `dzzen.squads_run`

---

## 3) Отчёты обратно в чат

Триггеры для сообщений:
- run success/fail
- approval required
- task moved to Done
- daily/weekly digest (cron)

Формат отчёта (короткий):
- что сделано (3–7 строк)
- какие артефакты созданы
- что нужно от человека (если нужно)

---

## 4) Безопасность

### 4.1 Кто может командовать
Не любой участник чата.

Режимы:
- `owner_only`
- `admins`
- `allowlist_users`

### 4.2 Защита от случайных команд
- префикс команд (например `/dz` или `dz:`)
- подтверждение опасных операций
- approvals для внешних действий

---

## 5) OpenClaw integration (как это делается нативно)

### 5.1 Получение сообщений
- DzzenOS skill слушает входящие сообщения через канал OpenClaw
- фильтрует по chat_binding
- парсит команды

### 5.2 Отправка сообщений
- `message.send` в нужный чат/тред

### 5.3 Cron дайджестов
- использовать OpenClaw `cron` для расписаний
- payload вызывает `dzzen.automations_run` или `dzzen.board_digest`

---

## 6) Модель данных (SQLite) — предложение

### 6.1 `board_chat_bindings`
- `id`
- `workspace_id`
- `board_id`
- `provider` (telegram|slack|discord)
- `chat_id` (string)
- `thread_id` (string, nullable)
- `mode` (control_only|control_plus_reports)
- `command_prefix` (string, default: "dz:")
- `permissions_mode` (owner_only|admins|allowlist)
- `allowlist` (json array)
- `created_at`, `updated_at`

### 6.2 `chat_events` (опционально)
- лог входящих команд и исходящих отчётов
- для дебага

---

## 7) MVP scope
Для v1 достаточно:
- Telegram topics binding
- команды: create task, status, run, move
- отчёты: run finished + approval needed
- daily digest (cron)

Slack/Discord — после (архитектура та же).
