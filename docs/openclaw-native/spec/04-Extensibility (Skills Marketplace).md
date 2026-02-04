# DzzenOS (OpenClaw Native) — Extensibility: skills + marketplace

## 0) Да, можно добавлять доп. skills через маркетплейс
В экосистеме OpenClaw это “родной” паттерн:
- skills добавляют инструменты (tools)
- агент может пользоваться ими в задачах

DzzenOS должен:
- уметь **подключать/отключать** skills на уровне workspace/board
- иметь **политику разрешений** (allowlist/denylist)
- учитывать риски: сеть/файлы/внешние посты

---

## 1) Классы skills (как мы их используем)

### 1.1 Connectors
- GitHub, Telegram, X/Twitter, Email, RSS
- основная роль: импорт/экспорт данных и действий

### 1.2 Content tools
- шаблоны постов
- генераторы social-pack
- SEO helpers

### 1.3 Dev tools
- repo ops, CI helpers, issue triage

---

## 2) Политика доступа (очень важно)

### 2.1 Уровни политики
- Workspace policy (глобально)
- Board policy (по домену)
- Task override (редко и явно)

### 2.2 Примеры правил
- Content board: разрешены “writing tools”, запрещены “deploy tools”
- Founder Ops: разрешены “calendar/email” но только через approvals

---

## 3) Marketplace: как организовать продуктово

### 3.1 Free core
База бесплатная:
- boards/tasks/docs/chat/runs/artifacts

### 3.2 Пакеты (будущая монетизация)
Платные/премиальные пакеты могут быть:
- Board templates packs (Founder Ops Pro / Content Engine)
- Agent profiles packs (под нишу)
- Automations packs (weekly review, контент‑план)
- Sync/multi-device

Важно: это не должно ломать локальность.

---

## 4) Технически: как DzzenOS интегрируется с skills

DzzenOS не обязан “встраивать” чужие skills.
Ему достаточно:
- хранить список разрешённых tools
- при запуске run формировать policy/context
- перед внешними действиями требовать approvals

Отдельно можно сделать:
- “skill registry” внутри DzzenOS, где видно какие skills установлены и какие capabilities дают.
