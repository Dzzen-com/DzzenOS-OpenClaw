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
AUTH_FILE="${AUTH_FILE:-/etc/dzzenos/auth.json}"
USERNAME="${USERNAME:-}"
PASSWORD="${PASSWORD:-}"

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

# 1) init auth file
mkdir -p /etc/dzzenos
chmod 700 /etc/dzzenos
node --experimental-strip-types "$REPO_DIR/scripts/init-auth.mjs" --file "$AUTH_FILE" --username "$USERNAME" --password "$PASSWORD" >/dev/null
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
ExecStart=/usr/bin/node --experimental-strip-types $REPO_DIR/skills/dzzenos/api/server.ts --port $API_PORT --host $API_HOST --db $REPO_DIR/data/dzzenos.db
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

cat >/etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  $CADDY_TLS

  encode zstd gzip

  # Public endpoints (login)
  @login path /login /login/* /auth/*
  handle @login {
    reverse_proxy $API_HOST:$API_PORT
  }

  handle {
    # Require DzzenOS login cookie for everything else.
    forward_auth $API_HOST:$API_PORT {
      uri /auth/verify
      copy_headers X-Auth-User
    }

    # DzzenOS API (behind auth)
    @api path /dzzenos-api/*
    handle @api {
      uri strip_prefix /dzzenos-api
      reverse_proxy $API_HOST:$API_PORT
    }

    # OpenClaw Gateway (token stays server-side)
    reverse_proxy $API_HOST:$GATEWAY_PORT {
      header_up Authorization "Bearer $GATEWAY_TOKEN"
    }
  }

  # If forward_auth denies, send user to /login
  handle_errors {
    @unauth expression {http.error.status_code} == 401
    redir @unauth /login 302
  }
}
CADDY

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "OK"
echo "Domain: https://$DOMAIN/"
echo "DzzenOS: https://$DOMAIN/__openclaw__/canvas/dzzenos/"
echo "OpenClaw Control UI: https://$DOMAIN/"
echo "Logs: journalctl -u caddy -f ; journalctl -u dzzenos-api -f"
