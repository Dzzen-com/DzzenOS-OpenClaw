# Install modes

Installer supports environment-aware modes:

- `local` - native OpenClaw on laptop/desktop (no domain prompt)
- `server` - VPS/server (can enable domain setup with Caddy + TLS + login)
- `docker` - running inside containerized environment (no domain setup by default)
- `cloudflare` - edge/tunnel/fronted setup (no domain setup by default)
- `auto` - default, detects environment

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
