# Logging & Debugging

DzzenOS must be debuggable by users and contributors.

## Goals
- A user can export logs and attach them to a GitHub issue.
- Logs must not leak secrets.

## v1 requirements
- Local log store (SQLite table or JSONL files under OpenClaw state dir)
- UI view: last N runs + automation runs + errors
- Export button (redacted)

## What to log
- task create/move
- run start/finish
- automation run steps
- approvals created/decided
- chat bindings commands

## Redaction
- tokens, headers, cookies
- webhook secrets
