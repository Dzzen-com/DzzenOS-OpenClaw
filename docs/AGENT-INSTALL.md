# Agent-driven install (chat → install → reply)

Goal: a user can message their OpenClaw agent something like:

> "Install DzzenOS-OpenClaw"

…and the agent will:
1) install/update DzzenOS on the gateway host
2) publish the UI to the OpenClaw Canvas host
3) reply with a ready-to-click URL (and SSH tunnel instructions if remote)

## Recommended agent instruction (copy/paste)

Use this message to your agent:

```
Install DzzenOS-OpenClaw on this host.

Steps:
1) Run:
   curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
2) After it finishes, reply with:
   - "DzzenOS installed ✅"
   - The URL to open DzzenOS via OpenClaw Canvas host:
     http://localhost:18789/__openclaw__/canvas/dzzenos/ (append ?token=... if required)
   - If this gateway is remote: also include the SSH tunnel command.

Do not expose the gateway publicly.
```

## Notes

- This works best when the agent has permission to run shell commands on the gateway host.
- If the agent can’t run commands, do the manual install from `docs/INSTALL.md`.
