# DzzenOS

DzzenOS — платформа Dzzen для соло‑фаундеров/файндеров: проекты, агенты, задачи, метрики, доходы.

## Архитектура (коротко)
- **Web**: Next.js (apps/web)
- **API**: сервисный слой (apps/api) — бизнес‑логика + RBAC, доступ к Postgres/Redis
- **Worker**: фоновые джобы (apps/worker)
- **Backoffice**: Directus (отдельно, подключен к той же Postgres)
- **DB**: Postgres
- **Cache/Queue**: Redis

Подробно — в Obsidian: `obsidian/remote-kb/DzzenOS/`.

## Репозиторий (monorepo)
- `apps/web` — UI
- `apps/api` — backend API
- `apps/worker` — background jobs
- `packages/shared` — общие типы/утилиты
- `docs` — документация (будем переносить/дублировать ключевое из Obsidian)
- `infra` — локалка/деплой
