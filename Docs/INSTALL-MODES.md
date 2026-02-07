# Install modes

Installer supports environment-aware modes:

- `local` - native OpenClaw on laptop/desktop (no domain prompt)
- `server` - VPS/server (can enable domain setup with Caddy + TLS + login)
- `docker` - running inside containerized environment (no domain setup by default)
- `cloudflare` - edge/tunnel/fronted setup (no domain setup by default)
- `auto` - default, detects environment

## Mode behavior details

- `local`
  - Intended for native laptop/desktop OpenClaw install.
  - Domain setup is skipped unless explicitly forced.
  - Good default for macOS local usage.
- `server`
  - Intended for VPS/bare metal.
  - Domain setup can be enabled interactively or via `--domain ...`.
  - If enabled, installer provisions Caddy + TLS + DzzenOS auth flow.
- `docker`
  - Intended for containerized runtime.
  - Domain setup is skipped by default.
  - Use external reverse proxy/tunnel strategy managed by your platform.
- `cloudflare`
  - Intended when Cloudflare/tunnel edge is already part of routing.
  - Domain setup is skipped by default.
  - Use platform-managed ingress/caching rules.

## Examples

Local native install:
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --mode local
```

Server with domain setup:
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- \
  --mode server \
  --domain dzzenos.example.com \
  --domain-email you@example.com \
  --username admin \
  --password 'StrongPassword!123'
```

Docker environment:
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --mode docker
```

Cloudflare-fronted environment:
```bash
curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --mode cloudflare
```

## UI profile

Build routing profile:

- `--ui-profile local` -> `VITE_OPENCLAW_PATH=/`
- `--ui-profile domain` -> `VITE_OPENCLAW_PATH=/openclaw`, `DZZENOS_API_BASE=/dzzenos-api`

If domain setup is enabled, installer automatically uses `domain` profile.

## Non-interactive automation tips

- Add `--yes` to avoid interactive prompts.
- Use `--json` for machine-readable response payload.
- Pin exact release with `--version vX.Y.Z` for deterministic CI/CD.
