# DzzenOS (OpenClaw Native) — Marketplace (Curated Skills)

Цель: сделать внутри DzzenOS **курируемый маркетплейс skills**, который:
- может подтягивать open-source skills из ClawHub
- показывает только совместимые и “безопасные” для нашей ОС
- поддерживает уровни доверия (official/verified/community)
- позже позволяет монетизировать (пакеты/лицензии), не ломая local-first

---

## 0) Термины
- **Skill** — пакет расширения OpenClaw (tools + метаданные), устанавливаемый в окружение пользователя.
- **DzzenOS Marketplace** — наш UI слой (каталог + политики) поверх skills.
- **ClawHub** — публичный реестр OpenClaw skills.

---

## 1) Уровни (tiers)

### 1.1 Official
- разработаны/поддерживаются Dzzen
- проходят security review
- имеют готовые presets политик (approvals, tool allowlist)

### 1.2 Verified
- community skills, прошедшие проверку
- мы фиксируем конкретную версию (pin)
- публикуем “compatibility badge” и policy presets

### 1.3 Community
- любые навыки из ClawHub (или ручная установка)
- показываются с предупреждением
- по умолчанию — строгие ограничения (deny внешние действия без approve)

---

## 2) Откуда берём skills

### 2.1 База: ClawHub
- DzzenOS может искать/ставить skills из ClawHub
- это даёт дистрибуцию и open-source экосистему

### 2.2 Наш curated index
В DzzenOS храним собственный индекс:
- какие skills мы рекомендуем
- их pinned versions
- их tier (official/verified/community)
- policy presets

Этот индекс можно хранить:
- локально (json) + обновлять по версии
- или опционально через облако (позже)

---

## 3) Политики и безопасность

### 3.1 Skill capabilities
Каждый skill должен иметь metadata:
- требует ли сеть
- требует ли файловый доступ
- пишет ли “наружу” (email/соцсети)
- какие токены нужны

DzzenOS Marketplace в UI показывает эти capabilities.

### 3.2 Approval presets
Для skills “наружу”:
- posting/email/sms
по умолчанию включаем approval-gate.

---

## 4) UX маркетплейса

### 4.0 MVP вариант: встроенный marketplace (Installed / Available)
До появления отдельного полноценного раздела Marketplace, “маркетплейс” может быть **встроен в страницы сущностей**:
- **Agents**: сверху `Installed` (установленные в SQLite), снизу `Available` (витрина пресетов), действие `Install`.
- **Skills (позже)**: тот же паттерн `Installed / Available` без отдельной страницы.

Плюсы:
- нативно и просто (как в Codex)
- не требует отдельной навигации/IA
- легко расширять при релизах: новые `Available` элементы появляются после обновления приложения

### 4.1 Витрина
- вкладки: Official / Verified / Community
- поиск
- фильтры по capability (content/github/email/social)

### 4.2 Карточка skill
- описание
- версия
- tier
- permissions/capabilities
- кнопка Install / Update / Disable
- presets: “Content board preset”, “Founder Ops preset”

---

## 5) Монетизация (позже)
Подход: free core.

Варианты монетизации без ломания local-first:
- платные **template packs** (boards + automations + agent profiles)
- платные **premium agent packs** (промпты/настройки/политики)
- платная **sync/multi-device**
- платные **verified integrations** (поддержка/обновления)

Важно: сам skill может оставаться open-source, а платными быть:
- контент/пакеты/подписка на обновления
- “unlock” через license key

---

## 6) Минимальная модель данных (SQLite)

### `marketplace_skills`
- `id`
- `slug`
- `source` (clawhub|local)
- `tier` (official|verified|community)
- `pinned_version` (text)
- `display_name`
- `description`
- `capabilities` (json)
- `policy_presets` (json)

### `installed_skills` (v1 implemented)
Фактическая таблица в DzzenOS (local-first), используется страницей **Skills** (Installed/Available):
- `slug` (PK) — skill id (это хранится в `agents.skills_json`)
- `display_name`
- `description`
- `tier` (official|verified|community)
- `enabled` (0/1)
- `source` (manual|marketplace)
- `preset_key` (nullable)
- `preset_defaults_json` (nullable) — база для Reset
- `sort_order`
- `capabilities_json` (json) — flags + `secrets[]`
- `created_at`, `updated_at`

Примечание: модель с `version/config/secret_refs` остаётся актуальной для будущих версий, где DzzenOS будет реально устанавливать/обновлять skills и хранить конфиг/секреты.

---

## 7) Интеграция с OpenClaw
DzzenOS Marketplace не обязан сам скачивать архивы.
Он может:
- вызывать стандартный механизм установки OpenClaw (CLI/встроенный API)
- проверять наличие skill в `skills/`
- писать конфиг presets в DzzenOS и/или OpenClaw

MVP: достаточно установки/обновления + включение policy.

---

## 8) v1 API endpoints (local)
Встроенный marketplace (без отдельной страницы marketplace):

Installed:
- `GET /skills`
- `POST /skills`
- `PATCH /skills/:slug`
- `POST /skills/:slug/reset` (только preset)
- `DELETE /skills/:slug` (uninstall)

Available presets:
- `GET /marketplace/skills`
- `POST /marketplace/skills/:preset_key/install` (Pro locked → 403)
