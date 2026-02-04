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
