# DzzenOS (OpenClaw Native) — Agent Library (Presets)

Goal: DzzenOS ships with a **library of preconfigured agent profiles** (presets) that users can:
- browse in a catalog-like UI
- customize (description, prompts, skills)
- create their own custom agents

This document defines the **data contract** for agents in DzzenOS and how another branch should integrate agents into:
- Kanban tasks
- Automations graphs

> Important: **Agent assignment does not happen on the Agent Library page.**

---

## 1) Terms (Agent profile vs Session)

### 1.1 OpenClaw agent (profile)
An **OpenClaw agent** is a reusable profile/config in OpenClaw (system prompt, tools/skills, model, policies).

In DzzenOS we reference it by `openclaw_agent_id`.

### 1.2 Session (per task / per run)
A **session** is the execution context for a specific task/run:
- chat history
- intermediate reasoning artifacts
- run logs

DzzenOS should create or reuse sessions based on a stable key (see Integration Contract).

### 1.3 DzzenOS agent profile (this feature)
A **DzzenOS agent profile** is a record stored in SQLite, shown in the Agent Library UI.
It binds UI metadata + overlays to an OpenClaw agent id:
- name, description, category, tags
- skills list (expected/allowed skills)
- prompt overlays (system/plan/execute/chat/report)

Presets are just agent profiles with `preset_key` set and with a stored `preset_defaults_json` for reset.

---

## 2) Agent fields (SQLite/API)

### 2.1 Core identity
- `id` (text) — primary key
- `display_name` (text, required)
- `emoji` (text, optional)
- `description` (text, optional)
- `enabled` (bool)
- `role` (text, optional) — informational label (e.g. `orchestrator`)
- `category` (text, required, default `general`)
- `tags` (string[]) — stored as JSON in `tags_json`

### 2.2 Binding to OpenClaw
- `openclaw_agent_id` (text, required) — OpenClaw agent profile id

### 2.3 Skills overlay (v1: stored only)
- `skills` (string[]) — stored as JSON in `skills_json`

Interpretation in future integration:
- can be treated as "expected skills" for the agent
- can be used to validate availability and show warnings
- later can map to OpenClaw tool/policy allowlists

### 2.4 Prompt overlays (v1: stored only)
Stored in `prompt_overrides_json`:

```json
{
  "system": "...",
  "plan": "...",
  "execute": "...",
  "chat": "...",
  "report": "..."
}
```

Interpretation in future integration:
- `system`: appended or injected as an extra system instruction for the session
- per-mode overlays are applied when DzzenOS requests plan/execute/chat/report behaviors

### 2.5 Presets
- `preset_key` (text, nullable, unique when set) — identifies a built-in preset like `core.content`
- `preset_defaults_json` (text, nullable) — frozen JSON snapshot for **Reset**
- `sort_order` (int, default 0) — preset ordering in UI

---

## 3) Integration Contract (for the next branch)

### 3.1 Selecting an agent for a task
When a user assigns an agent to a task (Kanban card):
1) store `agent_id` on the task/session record (DzzenOS DB)
2) use the selected agent profile when running `plan` / `execute` / `chat` / `report`

The Agent Library UI should optionally show read-only usage:
- how many tasks reference this `agent_id`
- last used time, run counts

### 3.2 Session key policy (recommended)
Use a stable OpenClaw session key per task, e.g.:
- `x-openclaw-session-key = <task_id>`

This ensures:
- chat and planning share context
- repeated runs stay consistent

### 3.3 Applying prompt overlays (recommended approach)
When calling the OpenClaw runtime:
- always use the agent’s `openclaw_agent_id`
- merge overlays:
  - base prompt in OpenClaw agent profile
  - + DzzenOS `prompt_overrides_json.system`
  - + per-mode overlay based on operation (`plan`/`execute`/`chat`/`report`)

If overlays are empty, rely on the OpenClaw agent defaults.

### 3.4 Applying skills overlay (future)
For v1, DzzenOS stores `skills_json` only.
In integration, you can:
- validate that required skills are installed/enabled
- show a warning in Kanban/Automation UI if missing
- later enforce allowlists/policies using the policy system

---

## 4) UX guidelines

### Agent Library page
- Shows presets + custom agent profiles
- Editing happens via right drawer (fast iteration)
- No assignment actions here

### Kanban/Automation screens (future)
- Agent selection happens there
- Show warnings if:
  - agent is disabled
  - OpenClaw agent id is missing/invalid
  - required skills are missing

