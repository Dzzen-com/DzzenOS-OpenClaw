# @dzzenos/ui

UI shell for DzzenOS (Issue #7): Linear-like layout scaffolding.

## What’s implemented

- Left sidebar (placeholder boards/workspaces)
- Top bar (search + New button placeholders)
- Main area with a tasks table (placeholder data)
- Task drawer placeholder (Radix Dialog) opened by selecting a row

## Run locally

From repo root:

```bash
corepack pnpm -C apps/ui dev
```

Then open the URL printed by Vite (usually http://localhost:5173).

## Version in UI

The sidebar version badge is injected automatically at build time.

Resolution order:

1. `VITE_APP_VERSION`
2. `VITE_DZZENOS_VERSION`
3. `VITE_PACKAGE_VERSION`
4. root `package.json` `version`
5. `git describe --tags --always`
6. `apps/ui/package.json` `version`
7. fallback `0.0.0`

This means after install/update from git or tagged releases, the platform UI version updates without manual edits.

If you want strict release versioning in CI/CD, set `VITE_APP_VERSION` explicitly during the build.

## Internationalization (i18n)

The UI uses `i18next` + `react-i18next`.

### Source files

- i18n bootstrap: `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/i18n/index.ts`
- translation dictionary: `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/i18n/resources.ts`
- i18n init import: `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/main.tsx`
- language selector UI: `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/components/Sidebar/Sidebar.tsx`

### Add a new language

1. Add dictionary entries in `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/i18n/resources.ts` (create a new object like `xxTranslation`).
2. Register the language in `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/i18n/index.ts`:
   - add to `resources`
   - add to `supportedLngs`
3. Add option in the language selector in `/Users/admin/.codex/worktrees/11bb/DzzenOS-OpenClaw/apps/ui/src/components/Sidebar/Sidebar.tsx`.
4. Run checks:
   - `pnpm -C apps/ui lint`
   - `pnpm -C apps/ui build`

### Rules for contributors

- Do not hardcode user-facing strings in components; use `t('...')`.
- Reuse existing keys where possible; avoid duplicate semantic keys.
- Keep English as fallback language.
- For new UI sections, add keys before shipping the feature.
