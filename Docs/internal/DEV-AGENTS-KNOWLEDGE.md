# Developer & AI Agent Knowledge Base

This page is the canonical entry point for **engineering docs** and **AI-agent reference context**.

Use this when you need implementation details, architecture constraints, operations runbooks, and legacy specs.

## 1) Core technical references

- API server source: `skills/dzzenos/api/server.ts`
- UI API contracts: `apps/ui/src/api/queries.ts`
- Shared API types: `apps/ui/src/api/types.ts`
- DB migrations: `skills/dzzenos/db/migrations/`
- Security tests: `packages/security-tests/`

### UI V2 (PR #70) implementation map

- App routing shell: `apps/ui/src/app/App.tsx`
- Main sidebar (single column, icon+text): `apps/ui/src/components/Sidebar/Sidebar.tsx`
- Shared top vertical submenu: `apps/ui/src/components/Layout/VerticalTopMenu.tsx`
- Agents hub page: `apps/ui/src/components/Agents/AgentsHubPage.tsx`
- Project home/pulse page: `apps/ui/src/components/Projects/ProjectHomePage.tsx`
- Task standalone page: `apps/ui/src/components/Tasks/TaskPage.tsx`
- Project archive page: `apps/ui/src/components/Projects/ProjectsArchivePage.tsx`
- Project-scoped memory page: `apps/ui/src/components/Docs/MemoryPage.tsx`

### Route model (UI V2)

- `/dashboard` — global pulse across active projects
- `/agents/*` — single agents page with vertical top menu
- `/projects/:projectId` — project pulse
- `/projects/:projectId/sections/:sectionId?mode=kanban|threads` — section work view
- `/projects/:projectId/tasks/:taskId` — full task page
- `/projects/:projectId/memory` — project-scoped memory hub
- `/settings/archive` — archived projects page
- `/docs` — docs page (no top vertical submenu)

### Navigation data contract

`GET /navigation/projects-tree?limitPerSection=5` now returns:

- `projects[]` ordered by `position` (active only by default)
- project counters including `needs_user`
- `focus_lists`:
  - `in_progress` (+ `in_progress_total`)
  - `needs_user` (+ `needs_user_total`)
- `needs_user` is defined as `review OR pending approvals`

This payload is used directly by `Sidebar.tsx`.

### Project lifecycle API (archive/order)

- `GET /projects?archived=only|all` (`active` by default when query param absent)
- `PATCH /projects/:id` supports:
  - `isArchived` / `is_archived`
  - `position`
- `POST /projects/reorder` with `{ orderedIds: string[] }`

### Agents orchestration API (OpenClaw-only)

- `GET /agents/:id/subagents`
- `PUT /agents/:id/subagents`
- `PATCH /agents/:id/orchestration`
- `GET /agents/:id/orchestration/preview`

Run orchestration remains a single OpenClaw run stream with delegation snapshot artifacts.

## 2) Product and architecture specs (legacy + detailed)

- Main product docs root: `Docs/openclaw-native/`
- Spec index: `Docs/openclaw-native/spec/INDEX.md`
- Detailed specs: `Docs/openclaw-native/spec/`
- Russian duplicate set (if needed): `Docs/openclaw-native/spec-ru/`

These specs are intentionally kept for deep design and implementation context.

## 3) Operations runbooks

- Install: `Docs/INSTALL.md`
- Install modes: `Docs/INSTALL-MODES.md`
- Domain mode: `Docs/DOMAIN-ACCESS.md`
- Agent install flow: `Docs/AGENT-INSTALL.md`
- Release and rollback: `Docs/RELEASE-OPERATIONS.md`
- Database and backups: `Docs/database.md`
- Data safety policy: `Docs/DATA-POLICY.md`

## 4) Security and policy

- Security policy: `SECURITY.md`
- Auth/session guardrails: `Docs/auth-session-guardrails.md`
- Security best-practices report: `security_best_practices_report.md`

## 5) Documentation update rule

For each new feature, update all relevant layers in one PR:

1. User-facing docs in UI page: `apps/ui/src/components/Docs/DocsPage.tsx`
2. Technical docs in `/Docs` (this folder)
3. API contract docs/examples if endpoint behavior changed
4. Any changed runbooks (install/ops/security), if applicable

This keeps user docs and dev/agent docs consistent.

## 6) UI i18n rules

Use these files as the source of truth for localization:

- i18n bootstrap: `apps/ui/src/i18n/index.ts`
- translation dictionary: `apps/ui/src/i18n/resources.ts`
- language selector UI: `apps/ui/src/components/Sidebar/Sidebar.tsx`
- i18n init import entry: `apps/ui/src/main.tsx`

When adding a language:

1. Add translation object in `apps/ui/src/i18n/resources.ts`.
2. Register it in `apps/ui/src/i18n/index.ts` (`resources` + `supportedLngs`).
3. Add it to the selector in `apps/ui/src/components/Sidebar/Sidebar.tsx`.
4. Verify with:
   - `pnpm -C apps/ui lint`
   - `pnpm -C apps/ui build`

Contributor rules:

- Never hardcode user-facing strings in components; use `t('...')`.
- Reuse existing translation keys when possible.
- Keep English fallback enabled.
