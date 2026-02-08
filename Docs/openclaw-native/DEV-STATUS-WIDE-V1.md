# Wide V1 Implementation Status (DzzenOS over OpenClaw)

Updated: 2026-02-08

## Scope implemented in this PR wave

### 1) Canonical domain and API
- Canonical naming moved to `workspace/board` in UI and API.
- Legacy `projects/sections` API endpoints are no longer public and return `410` with migration guidance.
- SSE aliases broadcast canonical and legacy event names for compatibility during migration.

### 2) Task-centric workspace UX
- Workspace page rebuilt around `Workspace -> Board -> Task`.
- Task is now the center of execution via a right-side drawer:
  - Brief
  - Chat
  - Runs
  - Approvals
  - Context
- Full loop supported from one place:
  - create task -> plan/execute/report -> approve/reject -> done.

### 3) Runtime and session model
- `session-first` flow remains default.
- `execution_mode` added to `task_sessions`: `single | squad`.
- Reasoning level controls surfaced in workspace task drawer.

### 4) Memory-first integration
- Memory docs use OpenClaw workspace files as source-of-truth.
- API/UI write-through updates file content and operational index.
- Board/workspace memory flows exposed through `/memory/docs`.

### 5) Governance and team mode
- Agent governance fields and flows added:
  - `agent_level` (`L1..L4`)
  - `onboarding_state`
  - review fields
- Team ACL model added:
  - users/sessions
  - workspace members
  - board members
  - invites
  - audit events
- New UI page: `Team & Access` for member/invite/audit operations.

### 6) OpenClaw control-plane integration
- New UI page: `OpenClaw Settings`.
- Read-only health/status and deep links for providers/models/agents/cron.
- No CRUD duplication of OpenClaw control-plane in DzzenOS.

## Deferred block: external channels (Email + Telegram/Slack)

External channel completion is intentionally tracked as a dedicated follow-up stream:

- [#79 Wide V1: External channel actions (Email/Telegram/Slack)](https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues/79)
- [#80 Wide V1: Governance & approval gating for external channel actions](https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues/80)
- [#81 Wide V1: Reliability, observability and E2E tests for external channels](https://github.com/Dzzen-com/DzzenOS-OpenClaw/issues/81)

These issues define acceptance criteria for:
- channel actions (`email.send`, `telegram.topic.post`, `slack.thread.post`),
- policy/approval enforcement by level and role,
- reliability and e2e verification.

## Local validation notes
- Typecheck: `pnpm -C apps/ui exec tsc --noEmit`
- UI build: `pnpm dzzenos:ui:build`
- Migrations test: `pnpm test:db:migrations`
- Smoke script currently fails in restricted sandbox environments where local port bind is blocked (`EPERM`).
