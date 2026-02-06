# DzzenOS (OpenClaw Native) — Engineering Guide (UI + Architecture)

This guide is the single source of truth for **how to build new pages and UI features** in DzzenOS OpenClaw‑native.
Read this before planning or implementing new work.

---

## 1) Purpose & Scope
- **Audience**: engineers and agents contributing UI/UX, API integrations, or docs.
- **Goal**: ensure a consistent architecture, design system, and interaction model.
- **Out of scope**: product strategy, marketplace policy, and SaaS/cloud roadmaps.

---

## 2) System Architecture (OpenClaw‑native)

### 2.1 Runtime responsibilities
- **OpenClaw**: runs sessions, tools, and model execution.
- **DzzenOS plugin**: provides product layer (boards/tasks/docs/policies) + UI API.

### 2.2 Data layer
- **SQLite** is the authoritative store for boards/tasks/docs/approvals.
- API is **local‑first** and optimized for fast UI reads.

### 2.3 Realtime model
- Server emits **SSE** at `/events`.
- Client listens and **invalidates query cache** to refresh affected data.

---

## 3) UI Architecture

### 3.1 Shell & layout
- `AppShell` wraps the app.
- **No global TopBar/Footer**. Context is provided per‑page via `PageHeader`.
- **Sidebar‑first navigation** is always visible on desktop.

### 3.2 Mobile navigation
- Hybrid model:
  - **Bottom tab bar** for primary pages.
  - **Sidebar drawer** for navigation/context, opened by the PageHeader menu button.

### 3.3 PageHeader (required)
- Every major page uses `PageHeader` for title + subtitle + actions.
- The header also exposes the mobile menu button.

---

## 4) Design System

### 4.1 Typography
- **Manrope** (body) + **Space Grotesk** (display).
- Fonts are **local** (WOFF2 in `apps/ui/public/fonts`).

### 4.2 Tokens
- Tokens live in `apps/ui/src/styles.css` under `:root`:
  - background/surface/card
  - border/muted/primary/accent
  - radius and shadows

### 4.3 Reusable components
Prefer existing UI components:
- `Button`, `Card`, `Input`, `InlineAlert`, `Skeleton`, `StatusDot`, `EmptyState`, `Tabs`.
- Icons: use local `apps/ui/src/components/ui/Icons.tsx`.

---

## 5) Page Patterns

### 5.1 Layout
- Use `max-w-6xl` container for page content.
- Keep pages **dense but readable**. Avoid unnecessary whitespace.

### 5.2 States
Always cover:
- **Loading** → `Skeleton`
- **Empty** → `EmptyState`
- **Error** → `InlineAlert`

---

## 6) Kanban Patterns

### 6.1 Landing flow
- **Boards grid** → select board → render `TaskBoard`.
- **Create board** via modal (`Radix Dialog`).

### 6.2 Statuses
Use fixed statuses (code‑aligned):
- Ideas → To do → In progress → Review → Release → Done → Archived

### 6.3 Task detail
- **Task drawer** is the main interaction surface.
- Do not create new “task pages” without coordination.

---

## 7) Realtime & Data Fetching

### 7.1 Query keys
- Boards: `['boards']`
- Tasks: `['tasks', boardId]`
- Docs: `['docs', 'overview']`, `['docs', 'board', boardId]`
- Runs/Approvals/Agents/Automations: use existing patterns

### 7.2 Invalidation
- On SSE event: invalidate the minimal set of keys.
- Avoid full cache resets.

---

## 8) Performance & Responsiveness

### 8.1 Performance
- Use `content-visibility` for dense lists (e.g., task cards).
- Avoid heavy renders in lists; prefer memoization and virtualization where needed.

### 8.2 Responsiveness
- Sidebar becomes drawer on mobile.
- Bottom nav is primary on mobile.
- Ensure `TaskDrawer` is full‑height and scrollable on small screens.

### 8.3 Caching policy
- **Static UI assets**: cacheable.
- **API responses**: no‑store (already enforced server‑side).

---

## 9) Conventions

### 9.1 File structure
- Pages: `apps/ui/src/components/<Area>/<Page>.tsx`
- Shared layout: `apps/ui/src/components/Layout`
- UI primitives: `apps/ui/src/components/ui`

### 9.2 Naming
- `Page` suffix for full screens.
- `Card` / `Panel` for modular UI blocks.

### 9.3 Icons
- Use local SVGs in `Icons.tsx`.
- Do not add external icon libraries unless approved.

---

## 10) Do / Don’t

**Do**
- Use existing components and tokens.
- Add PageHeader to new pages.
- Keep navigation consistent with sidebar‑first.

**Don’t**
- Introduce one‑off colors or spacing.
- Add new global layout elements without updating specs.
- Add external UI libraries unless strictly required.
