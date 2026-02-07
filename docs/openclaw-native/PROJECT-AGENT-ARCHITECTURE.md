# DzzenOS + OpenClaw: Project Agent Architecture

## Context

DzzenOS remains a shell on top of OpenClaw and should not duplicate gateway/control-plane concerns.
OpenClaw stays the source of truth for sessions, providers, and runtime behavior.

## Goals

- Enforce project-level agent isolation.
- Orchestrate task execution through stable session keys.
- Store agent identity/personality in OpenClaw workspace files.
- Scale from project to board to task without breaking existing UI flows.

## Layered model

1. Portfolio Agent (optional): global overview across projects.
2. Project Agent (required): main project orchestrator.
3. Board Specialist (optional): board-scoped specialist profile/agent.
4. Task Session (required): isolated task execution context.
5. Sub-Agents (optional): worker agents for lower-cost delegated work.

## Session key convention

- `project:<workspaceId>:main`
- `project:<workspaceId>:board:<boardId>:main`
- `project:<workspaceId>:board:<boardId>:task:<taskId>`

This provides deterministic routing through OpenClaw gateway.

## Agent memory and identity

Each project agent should use OpenClaw workspace files:

- `SOUL.md`: role, style, guardrails.
- `AGENTS.md`: operating behavior.
- `USER.md`: owner/team context.
- `IDENTITY.md`: stable identity notes.
- `memory/WORKING.md`: active state.
- `memory/YYYY-MM-DD.md`: daily logs.
- `MEMORY.md`: durable decisions and facts.

DzzenOS UI should edit these files, instead of keeping memory only in DB fields.

## Task orchestration

Task session acts as a task-level orchestrator:

1. `plan`: decomposition and milestones.
2. `execute`: implementation with delegation.
3. `report`: completion summary and artifacts.

Sub-agents should run via session tools (spawn/send) and isolated job patterns.

## Cron and heartbeat

- OpenClaw Cron is the single scheduler source of truth (no local scheduler in DzzenOS).
- Heartbeat via OpenClaw cron + isolated sessions only.
- Use staggered schedules to avoid synchronized spikes.
- Use cheaper models for routine checks; reserve expensive models for synthesis/review.

## Implementation phases

1. Workspace scope for agents (DB + API + UI).
2. Namespaced session keys for task sessions.
3. Board overlays (skills/prompts/memory pointers).
4. Sub-agent orchestration (spawn/send and task-level routing).
5. Heartbeat + notifications + standup digest (backed by OpenClaw cron jobs).

## OpenClaw references

- Architecture: https://docs.openclaw.ai/concepts/architecture
- Multi-agent: https://docs.openclaw.ai/concepts/multi-agent
- Session management: https://docs.openclaw.ai/session
- OpenResponses API: https://docs.openclaw.ai/gateway/openresponses-http-api
- Agent bootstrapping: https://docs.openclaw.ai/start/bootstrapping
- Agent workspace: https://docs.openclaw.ai/agent-workspace
- Memory: https://docs.openclaw.ai/concepts/memory
- Session tools: https://docs.openclaw.ai/session-tool
- Cron jobs: https://docs.openclaw.ai/automation/cron-jobs
