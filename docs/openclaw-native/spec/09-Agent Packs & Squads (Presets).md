# DzzenOS (OpenClaw Native) — Agent Packs & Squads (Presets)

Цель: сделать DzzenOS не «пустой ОС», а системой с **нативными преднастроенными агентами**, которые:
- легко выбираются на доске/в задаче/в автоматизациях
- умеют работать «роем» (с разными ролями)
- имеют встроенные policies/approvals
- могут расширяться через marketplace

---

## 0) Термины
- **Agent Profile** — профиль агента (роль, system prompt, allowed tools, defaults).
- **Agent Pack** — пакет преднастроек: набор profiles + политики + шаблоны.
- **Squad** — «рой»: оркестратор + несколько под‑агентов (сессии) с ролями.

---

## 1) Зачем это нужно (продуктово)
1) **Time‑to‑Value**: пользователь ставит «Content Squad» и сразу получает качество.
2) **Качество**: writer+editor+fact-checker стабильно лучше, чем один агент.
3) **Повторяемость**: один и тот же pack используется в карточках и automations.
4) **Безопасность**: presets сразу включают approvals для публикации и внешних действий.
5) **Маркетплейс**: agent packs — идеальная единица распространения/монетизации.

---

## 2) Модель: Agent Pack как продуктовый артефакт
Agent Pack содержит:
- profiles (набор ролей)
- squad topology (кто кого вызывает и в каком порядке)
- policy preset (tools allow/deny + approvals)
- optional: board templates + automation templates
- variables schema (настройки, которые пользователь может менять)

### 2.1 Пример состава пакета
**Content Pack**:
- Writer (создаёт черновик)
- Editor (улучшает структуру/язык)
- Fact Checker (проверяет утверждения и источники)
- Social Packager (делает посты/тизеры)
- Orchestrator (управляет пайплайном)

---

## 3) Squad execution model (как «рой» работает)

### 3.1 Оркестратор
Squad запускается одной командой:
- вход: brief + context pack (docs) + настройки
- выход: artifacts + report

Внутри:
1) Writer → draft
2) Editor → revised draft
3) Fact Checker → issues list / suggested fixes
4) Writer/Editor → apply fixes
5) Social Packager → social pack
6) Approval gate → publish (опционально)

### 3.2 Под-агенты как отдельные сессии
Каждая роль — отдельная сессия агента, чтобы:
- не смешивать контекст и цели
- иметь понятные логи
- переиспользовать роли в других squads

Технически (в терминах OpenClaw):
- использовать `sessions_spawn` для под‑агентов
- результаты собирать оркестратором

---

## 4) Где это используется

### 4.1 В карточке задачи
На карточке выбираем:
- Agent Pack (или default от board)
- режим (быстро/баланс/качество)
- override variables (tone, audience)

Кнопка Start запускает squad и пишет artifacts.

### 4.2 В automation graph
Добавляем ноду:
- **Agent Squad Node**

Параметры:
- pack_id
- входные данные из data-chain
- output mapping (куда положить результат)

---

## 5) Настраиваемость (user overrides)

### 5.1 Variables schema
Каждый pack публикует schema настроек, например:
- tone_of_voice
- audience
- language
- brand_voice_doc_id
- platforms (twitter/telegram/linkedin)

### 5.2 Override уровни
- workspace defaults
- board defaults
- task overrides

---

## 6) Marketplace: отдельный раздел
В DzzenOS marketplace добавляем вкладку **Agent Packs**:
- tiers: Official / Verified / Community
- pinned versions
- presets (политики) по умолчанию

Модель монетизации позже:
- packs могут быть бесплатные (core)
- pro packs (нишевые/продвинутые)
- подписка на обновления/premium templates

---

## 7) Минимальная модель данных (SQLite)

### 7.1 `agent_packs`
- `id` (int)
- `slug` (text unique)
- `tier` (official|verified|community)
- `name`
- `description`
- `version`
- `variables_schema` (json)
- `defaults` (json)

### 7.2 `agent_pack_profiles`
- `id`
- `pack_id`
- `role_key` (writer/editor/fact_checker/social/orchestrator)
- `profile_config` (json) — system prompt, tools allowlist, model hints

### 7.3 `agent_pack_graph`
- `pack_id`
- `graph` (json) — последовательность шагов/зависимости (mini-DAG)

### 7.4 `agent_pack_policy_presets`
- `pack_id`
- `policy` (json)

---

## 8) MVP: что делаем первым
1) Content Pack (writer/editor/social) без сложного fact-check
2) Agent Squad Node для automations
3) UI выбора pack на board и task
4) Preset policy: публикации только через approvals

---

## 9) v1 (сейчас): Agents page как встроенный marketplace

До полноценного “Agent Packs Marketplace” мы делаем **простую встроенную витрину** прямо на странице Agents:

### 9.1 Термины (важно)
- В UI DzzenOS сейчас “Agent” = **agent profile** (профиль/шаблон), который позже используется как “основа” для запуска **сессии OpenClaw** на задаче.
- `openclaw_agent_id` в этом профиле — это ссылка на базового OpenClaw агента (по умолчанию `main`).

### 9.2 Паттерн Installed / Available
- **Installed** — записи в SQLite таблице `agents` (их можно редактировать, дублировать, удалять/disable).
- **Available** — каталог пресетов в коде (обновляется при релизах), показывается даже если DB пустая.
- Действие **Install** создаёт запись в `agents` из пресета.
- Pro/Subscription элементы — **видимы**, но `Install` недоступен (пока нет подписок).

### 9.3 Принцип “не ломаем OpenClaw”
Мы не меняем OpenClaw execution model.
DzzenOS лишь хранит **overlays** (skills/prompts/metadata) для будущего применения при запуске сессий:
- `skills_json` — список skill ids (ожидаемые/целевые skills)
- `prompt_overrides_json` — надстройки по режимам (`system/plan/execute/chat/report`)

### 9.4 Почему fresh DB = 0 installed
Новые пользователи должны видеть “Available” и осознанно нажимать Install.
Это также позволяет релизам добавлять новые пресеты без конфликтов.

### 9.5 UI/UX (как в Codex, но проще)
Страница Agents построена по паттерну “Installed / Available” и оптимизирована под быстрые действия:

- **Header**: поиск + фильтр категории + `New agent`
  - Search is **keyboard-first**:
    - `/` фокусит search (если фокус не в поле ввода)
    - `Esc` очищает search, затем сбрасывает category filter
  - Поиск **multi-term** (токены): все слова должны находиться в данных агента.
  - `Clear` появляется только если активны фильтры.
- **Installed**: то, что реально установлено в SQLite (`agents`)
  - Карточки показывают: `OpenClaw agent id`, `Skills: N`, `Prompts: N`, usage (tasks / runs 7d / last used)
  - Disabled агенты сгруппированы отдельно (скрыто по умолчанию)
  - Настройки через правый drawer: `Overview / Prompts / Skills / Usage`
- **Available presets**: витрина пресетов из кода (обновляется при релизах)
  - `Install` создаёт запись в `agents` (после этого можно редактировать)
  - Pro/Subscription элементы **видимы**, но `Install` недоступен (пока нет подписок)

### 9.6 Контракты данных (кратко)
- Preset catalog API: `GET /marketplace/agents`
- Install API: `POST /marketplace/agents/:preset_key/install`
- Installed agents API:
  - `GET /agents` (включая computed usage)
  - `POST /agents`, `PATCH /agents/:id`
  - `POST /agents/:id/reset` (только для preset)
  - `POST /agents/:id/duplicate` (сохраняет тот же `openclaw_agent_id`)
  - `DELETE /agents/:id` (только custom; presets нельзя удалить)

Важно: `openclaw_agent_id` **не уникален** — несколько DzzenOS profiles могут ссылаться на один OpenClaw agent (например `main`).
