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
