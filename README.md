# DzzenOS

DzzenOS — платформа Dzzen для соло‑фаундеров/файндеров: проекты, агенты, задачи, метрики, доходы.

## Архитектура (коротко)

## Secrets/Env
- Secrets (DB/Redis, OAuth secrets, Directus token) are **server-only** env vars.
- Any env var prefixed with `NEXT_PUBLIC_` is public and must not contain secrets.
- Use `.env.example` as a template.

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
