# ADR 0001: Frontend stack (v1)

Date: 2026-02-04

## Decision
For DzzenOS-OpenClaw v1 we use:

- **React + Vite + TypeScript** (fast local-first dev loop)
- **Tailwind CSS** (ship Linear-like UI quickly)
- **Radix UI** primitives (menus/dialogs/popovers)
- **TanStack Query** (data fetching + caching for local API)
- **React Flow** (automation graph editor, n8n-like)
- **dnd-kit** (Kanban drag & drop)

## Rationale
- We do not need SSR. We need a responsive, app-like UI.
- Vite is minimal and fast.
- Libraries chosen are permissive, widely used, and composable.

## Non-goals
- Next.js/SSR in v1.
- Forking n8n (license).
