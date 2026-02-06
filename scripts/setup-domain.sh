#!/usr/bin/env bash
set -euo pipefail

# Setup DzzenOS domain access with Caddy reverse proxy + login page.
# Requires: Ubuntu/Debian-ish host with systemd.

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"
GATEWAY_PORT="${GATEWAY_PORT:-18789}"
API_PORT="${API_PORT:-8787}"
API_HOST="${API_HOST:-127.0.0.1}"
REPO_DIR="${REPO_DIR:-$HOME/dzzenos-openclaw}"
DZZENOS_DATA_DIR="${DZZENOS_DATA_DIR:-/var/lib/dzzenos-openclaw}"
AUTH_FILE="${AUTH_FILE:-/etc/dzzenos/auth.json}"
USERNAME="${USERNAME:-}"
PASSWORD="${PASSWORD:-}"
AUTH_TTL_SECONDS="${AUTH_TTL_SECONDS:-604800}"
AUTH_PASSWORD_POLICY="${AUTH_PASSWORD_POLICY:-strict}"
AUTH_COOKIE_SAMESITE="${AUTH_COOKIE_SAMESITE:-Strict}"

# HSTS: off | on | auto
# - auto: enable only after HTTPS works (certificate issued)
HSTS_MODE="${HSTS_MODE:-auto}"
HSTS_INCLUDE_SUBDOMAINS="${HSTS_INCLUDE_SUBDOMAINS:-1}"
HSTS_PRELOAD="${HSTS_PRELOAD:-0}"

# Cache policy
# - We default to no-store for HTML/auth (avoid stale shell during fast iteration)
# - We cache hashed static assets for speed.
CACHE_STATIC_MAX_AGE="${CACHE_STATIC_MAX_AGE:-31536000}"

if [ -z "$DOMAIN" ]; then echo "DOMAIN is required" >&2; exit 2; fi
if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then echo "USERNAME and PASSWORD are required" >&2; exit 2; fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "$1 is required" >&2; exit 2; }; }
need node
need git

GATEWAY_TOKEN=""
if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
  GATEWAY_TOKEN=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH);process.stdout.write(j?.gateway?.auth?.token||"");}catch(e){process.exit(0)}')
fi
if [ -z "$GATEWAY_TOKEN" ]; then
  echo "Could not read gateway token from $OPENCLAW_CONFIG_PATH" >&2
  echo "Set OPENCLAW_CONFIG_PATH correctly or export GATEWAY_TOKEN." >&2
  exit 2
fi

if command -v getent >/dev/null 2>&1; then
  echo "[dzzenos] DNS check: resolving $DOMAIN..."
  getent ahosts "$DOMAIN" | head -n 3 || true
else
  echo "WARN: getent not available; DNS check skipped." >&2
fi

# Warn if gateway bind looks non-loopback
GATEWAY_BIND=""
if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
  GATEWAY_BIND=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH);const v=j?.gateway?.bind??j?.gateway?.host??j?.gateway?.listen??"";process.stdout.write(String(v||""));}catch(e){process.exit(0)}')
fi
if [ -n "$GATEWAY_BIND" ]; then
  case "$GATEWAY_BIND" in
    127.0.0.1|localhost|::1) ;;
    *) echo "WARN: OpenClaw Gateway bind appears non-loopback ($GATEWAY_BIND). Recommended: loopback only." >&2 ;;
  esac
fi

# 1) init auth file
mkdir -p /etc/dzzenos
chmod 700 /etc/dzzenos
mkdir -p "$DZZENOS_DATA_DIR"
chmod 700 "$DZZENOS_DATA_DIR"
AUTH_TTL_SECONDS="$AUTH_TTL_SECONDS" AUTH_PASSWORD_POLICY="$AUTH_PASSWORD_POLICY" \
  node --experimental-strip-types "$REPO_DIR/scripts/init-auth.mjs" \
  --file "$AUTH_FILE" --username "$USERNAME" --password "$PASSWORD" \
  --ttl-seconds "$AUTH_TTL_SECONDS" --password-policy "$AUTH_PASSWORD_POLICY" >/dev/null
chmod 600 "$AUTH_FILE"

# 2) systemd unit for dzzenos api
cat >/etc/systemd/system/dzzenos-api.service <<UNIT
[Unit]
Description=DzzenOS Local API (incl. auth)
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR
Environment=PORT=$API_PORT
Environment=HOST=$API_HOST
Environment=DZZENOS_AUTH_FILE=$AUTH_FILE
Environment=DZZENOS_DATA_DIR=$DZZENOS_DATA_DIR
Environment=AUTH_TTL_SECONDS=$AUTH_TTL_SECONDS
Environment=AUTH_COOKIE_SAMESITE=$AUTH_COOKIE_SAMESITE
ExecStart=/usr/bin/node --experimental-strip-types $REPO_DIR/skills/dzzenos/api/server.ts --port $API_PORT --host $API_HOST
Restart=on-failure
RestartSec=2

# logs -> journalctl -u dzzenos-api -f

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now dzzenos-api.service

# 3) install caddy (if missing)
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# 4) write caddyfile
CADDY_TLS=""
if [ -n "$EMAIL" ]; then
  CADDY_TLS="tls $EMAIL"
fi

hsts_header_value() {
  local v="max-age=31536000"
  if [ "${HSTS_INCLUDE_SUBDOMAINS}" = "1" ]; then
    v="$v; includeSubDomains"
  fi
  if [ "${HSTS_PRELOAD}" = "1" ]; then
    v="$v; preload"
  fi
  echo "$v"
}

write_caddyfile() {
  local hsts_enabled="$1" # 0|1
  local HSTS_LINE=""
  if [ "$hsts_enabled" = "1" ]; then
    HSTS_LINE="Strict-Transport-Security \"$(hsts_header_value)\""
  fi

  cat >/etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  $CADDY_TLS

  encode zstd gzip

  # Security headers (baseline hardening)
  header {
    $HSTS_LINE
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    # CSP is intentionally minimal to avoid breaking OpenClaw UI.
  }

  # Cache policy
  # - No-store for auth and HTML (avoid stale UI during rapid iteration)
  # - Cache hashed assets for speed
  @auth path /login /login/* /auth/*
  header @auth Cache-Control "no-store"

  @static path /__openclaw__/canvas/dzzenos/assets/*
  header @static Cache-Control "public, max-age=${CACHE_STATIC_MAX_AGE}, immutable"

  # If OpenClaw serves other hashed assets, cache them too.
  @static2 path /assets/*
  header @static2 Cache-Control "public, max-age=${CACHE_STATIC_MAX_AGE}, immutable"

  # Default: don't cache (safe)
  header Cache-Control "no-store"

  # Limit request body size (helps against abuse)
  request_body {
    max_size 10MB
  }

  # Public endpoints (login)
  handle @auth {
    reverse_proxy $API_HOST:$API_PORT
  }

  handle {
    # Require DzzenOS login cookie for everything else.
    forward_auth $API_HOST:$API_PORT {
      uri /auth/verify
      copy_headers X-Auth-User
    }

    # Nice routes
    redir / /dashboard 302
    redir /dashboard /__openclaw__/canvas/dzzenos/ 302

    # Keep OpenClaw UI under /openclaw
    @openclaw path /openclaw*
    handle @openclaw {
      uri strip_prefix /openclaw
      reverse_proxy $API_HOST:$GATEWAY_PORT {
        header_up Authorization "Bearer $GATEWAY_TOKEN"
        header_down -Server
      }
    }

    # DzzenOS API (behind auth)
    @api path /dzzenos-api/*
    handle @api {
      uri strip_prefix /dzzenos-api
      reverse_proxy $API_HOST:$API_PORT
    }

    # Default: OpenClaw at root paths (for compatibility)
    reverse_proxy $API_HOST:$GATEWAY_PORT {
      header_up Authorization "Bearer $GATEWAY_TOKEN"

      # Don't leak anything sensitive via downstream headers
      header_down -Server
    }
  }

  # If forward_auth denies, send user to /login
  handle_errors {
    @unauth expression {http.error.status_code} == 401
    redir @unauth /login 302
  }
}
CADDY
}

echo "[dzzenos] writing Caddyfile (HSTS=off initially)"
write_caddyfile 0

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "[dzzenos] waiting for TLS certificate issuance (Caddy)"
# Try HTTPS a few times (DNS/ACME can take a moment)
HTTPS_OK=0
for i in 1 2 3 4 5; do
  if curl -fsS --max-time 5 "https://$DOMAIN/login" >/dev/null 2>&1; then
    HTTPS_OK=1
    break
  fi
  sleep 2
done

if [ "$HTTPS_OK" != "1" ]; then
  echo "WARN: HTTPS check failed. TLS cert may not be ready yet." >&2
  echo "- Ensure: DNS A/AAAA points to this server" >&2
  echo "- Ensure: inbound ports 80/443 are open" >&2
  echo "- Watch logs: journalctl -u caddy -f" >&2
else
  echo "[dzzenos] HTTPS OK"

  if [ "$HSTS_MODE" = "on" ] || [ "$HSTS_MODE" = "auto" ]; then
    echo "[dzzenos] enabling HSTS (mode=$HSTS_MODE)"
    write_caddyfile 1
    caddy validate --config /etc/caddy/Caddyfile
    systemctl reload caddy || systemctl restart caddy
  fi
fi

echo "OK"
echo "Domain:    https://$DOMAIN/"
echo "Login:     https://$DOMAIN/login"
echo "Dashboard: https://$DOMAIN/dashboard"
echo "DzzenOS:   https://$DOMAIN/__openclaw__/canvas/dzzenos/"
echo "OpenClaw:  https://$DOMAIN/openclaw"
echo "Logs: journalctl -u caddy -f ; journalctl -u dzzenos-api -f"
