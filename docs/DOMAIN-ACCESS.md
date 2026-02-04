# Domain access (server/VPS) — Caddy + TLS + DzzenOS login

This guide enables **secure access from anywhere** (phone, laptop) via a custom domain, without exposing your OpenClaw Gateway token.

## What you get

- `https://<your-domain>/login` — a DzzenOS-themed login page
- After login:
  - DzzenOS dashboard (nice URL): `https://<your-domain>/dashboard` (redirects to Canvas)
  - DzzenOS dashboard (Canvas path): `https://<your-domain>/__openclaw__/canvas/dzzenos/`
  - OpenClaw Control UI: `https://<your-domain>/openclaw`

## Security model

- OpenClaw Gateway stays **loopback-only** (`bind=loopback`).
- Caddy is the only public entry point (ports **80/443**).
- Your OpenClaw token is kept **server-side** in `/etc/caddy/Caddyfile` and is injected as an `Authorization: Bearer ...` header.
- Users authenticate via a **cookie session** (username/password) handled by DzzenOS API (`/auth/*`).
- Hardening included:
  - strict security headers (HSTS, nosniff, etc.)
  - request body size limit
  - basic brute-force protection on login (rate limit + temporary IP block)

## Install (recommended)

Use the installer and answer:
- Gateway location: `server/VPS`
- Setup domain access: `yes`

The installer will:
- create `/etc/dzzenos/auth.json` (hashed password + cookie secret)
- install and start a `dzzenos-api` systemd service
- install Caddy + write `/etc/caddy/Caddyfile`

## Caching (browser + Cloudflare)

Default policy (recommended for fast iteration + fewer “stale UI” bugs):

- **Auth + HTML**: `Cache-Control: no-store`
- **Static hashed assets** (`/__openclaw__/canvas/dzzenos/assets/*`): `Cache-Control: public, max-age=31536000, immutable`

### Cloudflare recommendation

- If you use Cloudflare in front of the server:
  - Set cache mode to **Respect Existing Headers** (recommended).
  - Do **NOT** enable “Cache Everything” globally.
  - If you create rules:
    - Bypass cache for `/login*` and `/auth/*`
    - Allow caching for `*/assets/*` and `*/__openclaw__/canvas/dzzenos/assets/*`

This keeps the UI snappy but prevents login/session pages from being cached.

## Operations

### Logout

If you want a logout button, DzzenOS UI shows it automatically in domain mode.
It clears the cookie and redirects to `/login`.

### View logs

```bash
journalctl -u caddy -f
journalctl -u dzzenos-api -f
journalctl -u openclaw-gateway -f
```

### Restart services

```bash
systemctl restart caddy
systemctl restart dzzenos-api
systemctl restart openclaw-gateway
```

### Reset username/password

Re-run the domain setup script:

```bash
DOMAIN=dzzenos.example.com \
USERNAME=admin \
PASSWORD='new-strong-password' \
REPO_DIR=$HOME/dzzenos-openclaw \
sudo -E bash $REPO_DIR/scripts/setup-domain.sh
```

## Notes

- DNS must point your domain to the server IP (A/AAAA record) before TLS will succeed.
- For hardening later, we can add rate limits and optional fail2ban rules.
