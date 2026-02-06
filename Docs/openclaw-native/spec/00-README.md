# DzzenOS → OpenClaw Native (Local‑first) — README

Это ветка документации про **встраивание DzzenOS внутрь OpenClaw** как нативного решения.

## Почему меняем курс
OpenClaw быстро растёт, потому что:
- работает с любыми моделями
- исполняется **на железе пользователя**
- удобен как “операционка” для агента

Отсюда новая стратегия:
- **DzzenOS = продукт/UX слой поверх OpenClaw**, который ставится как skill/пакет
- выполнение агентных задач происходит локально (OpenClaw)
- облако (если понадобится) — опционально: синк/маркетплейс/платные пакеты, но не обязательный рантайм

## Что тут лежит
- `01-Product (Native DzzenOS).md` — продуктовая концепция: доски, карточки, сессии агентов, доки
- `02-Architecture (Local-first).md` — архитектура: хранилище, интерфейсы, исполнение, безопасность
- `03-UX Spec (Boards + Cards + Docs).md` — как организовать интерфейс и основные экраны
- `13-Engineering Guide (UI + Architecture).md` — единый инженерный гайд по UI и архитектуре
- `04-Extensibility (Skills Marketplace).md` — расширяемость через skills и политики
- `07-Marketplace (Curated Skills).md` — курируемый маркетплейс (Official/Verified/Community) поверх ClawHub
- `08-Policies & Approvals (Skills + Actions).md` — политики tools/skills и approvals (workspace/board/task)
- `09-Agent Packs & Squads (Presets).md` — преднастроенные агенты и «рой» (squads) для задач и automations
- `10-Roadmap (v1 vs later).md` — roadmap: что в v1 и что позже
- `11-Epics (v1).md` — epics для планирования разработки
- `12-Chat Bindings (Telegram Topics + Slack Threads).md` — привязка досок к чат‑тредам для управления и отчётов

## Важное
Документы в этой папке описывают **OpenClaw-native, local-first** DzzenOS. Старый Directus/SaaS-контур удалён из репозитория, чтобы не путать пользователей.
Дальше развиваем **OpenClaw Native** как основной вектор.
