# Remote access (server → laptop)

DzzenOS-OpenClaw runs inside OpenClaw on a remote host (e.g. a droplet).

## Recommended (no public ports): SSH tunnel

If the OpenClaw Gateway is bound to loopback (recommended), use an SSH tunnel:

```bash
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>
```

Then open:
- Control UI: `http://localhost:18789/`

## DzzenOS UI via Canvas host

OpenClaw serves a static **Canvas host** under:

- `/__openclaw__/canvas/`

DzzenOS can publish its built UI to the canvas folder and be opened at:

- `http://localhost:18789/__openclaw__/canvas/dzzenos/` (when tunneled)

### Publish DzzenOS UI to Canvas

From the DzzenOS repo root on the server:

```bash
corepack enable
corepack pnpm install
corepack pnpm dzzenos:canvas:publish
```

This builds `apps/ui` and copies the static build into the OpenClaw canvas directory.

> Note: Your gateway may require a token. If so, append `?token=...`.
