#!/usr/bin/env bash
set -euo pipefail

# DzzenOS-OpenClaw installer (remote/server friendly)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash

REPO_URL_DEFAULT="https://github.com/Dzzen-com/DzzenOS-OpenClaw.git"
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/dzzenos-openclaw}"

OPENCLAW_CONFIG_PATH_DEFAULT="$HOME/.openclaw/openclaw.json"
OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$OPENCLAW_CONFIG_PATH_DEFAULT}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

HOST_DEFAULT="127.0.0.1"
GATEWAY_PORT_DEFAULT="18789"
HOST="${HOST:-$HOST_DEFAULT}"
GATEWAY_PORT="${GATEWAY_PORT:-$GATEWAY_PORT_DEFAULT}"

JSON_MODE=0
for arg in "$@"; do
  if [ "$arg" = "--json" ]; then
    JSON_MODE=1
  fi
done

# --- pretty printing ---
if [ $JSON_MODE -eq 0 ] && [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; RED='\033[31m'; GRN='\033[32m'; YLW='\033[33m'; BLU='\033[34m'; RST='\033[0m'
else
  BOLD=''; DIM=''; RED=''; GRN=''; YLW=''; BLU=''; RST=''
fi

step() { [ $JSON_MODE -eq 1 ] || echo -e "${BOLD}${BLU}==>${RST} ${BOLD}$*${RST}"; }
info() { [ $JSON_MODE -eq 1 ] || echo -e "${DIM} • $*${RST}"; }
ok()   { [ $JSON_MODE -eq 1 ] || echo -e "${GRN}✔${RST} $*"; }
warn() { [ $JSON_MODE -eq 1 ] || echo -e "${YLW}!${RST} $*"; }
err()  { [ $JSON_MODE -eq 1 ] || echo -e "${RED}✖${RST} $*"; }

die() { err "$*"; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

step "DzzenOS-OpenClaw installer"
info "repo:   $REPO_URL"
info "target: $INSTALL_DIR"

need_cmd git
need_cmd node
need_cmd corepack

step "1/4 Clone or update"
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing repo found — pulling latest"
  (cd "$INSTALL_DIR" && git pull --rebase)
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
ok "Repo ready"

cd "$INSTALL_DIR"

step "2/4 Enable Corepack + install dependencies"
corepack enable >/dev/null 2>&1 || true
corepack pnpm install --frozen-lockfile
ok "Dependencies installed"

step "3/5 Build UI + publish to OpenClaw Canvas host"
export OPENCLAW_STATE_DIR

# Optional interactive setup for server domain access
SETUP_DOMAIN=0
DOMAIN=""
DOMAIN_EMAIL=""
AUTH_USERNAME=""
AUTH_PASSWORD=""

if [ $JSON_MODE -eq 0 ]; then
  echo
  echo -e "${BOLD}Where is your OpenClaw Gateway running?${RST}"
  echo "  1) local machine (no domain)"
  echo "  2) server/VPS (optionally with domain)"
  read -r -p "> " WHERE
  if [ "${WHERE:-}" = "2" ]; then
    read -r -p "Set up secure domain access (Caddy + TLS + login page)? [y/N] " ANS
    if [[ "${ANS:-}" =~ ^[Yy]$ ]]; then
      SETUP_DOMAIN=1
      read -r -p "Domain (e.g. dzzenos.example.com): " DOMAIN
      read -r -p "Email for Let's Encrypt (optional): " DOMAIN_EMAIL
      read -r -p "Login username: " AUTH_USERNAME
      read -r -s -p "Login password: " AUTH_PASSWORD
      echo
    fi
  fi
fi

if [ $SETUP_DOMAIN -eq 1 ]; then
  export DZZENOS_API_BASE="/dzzenos-api"
fi

corepack pnpm dzzenos:canvas:publish
ok "UI published to Canvas"

if [ $SETUP_DOMAIN -eq 1 ]; then
  step "4/5 Setup domain reverse proxy + auth"
  sudo -n true 2>/dev/null || warn "May prompt for sudo password (to install Caddy + systemd units)."
  DOMAIN="$DOMAIN" EMAIL="$DOMAIN_EMAIL" USERNAME="$AUTH_USERNAME" PASSWORD="$AUTH_PASSWORD" \
    OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG_PATH" GATEWAY_PORT="$GATEWAY_PORT" REPO_DIR="$INSTALL_DIR" \
    sudo -E bash "$INSTALL_DIR/scripts/setup-domain.sh"
  ok "Domain setup complete"
fi

step "5/5 How to open (secure)"
TOKEN=""
if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
  TOKEN=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH||"'$OPENCLAW_CONFIG_PATH'");process.stdout.write(j?.gateway?.auth?.token||"");}catch(e){process.exit(0)}')
fi

CONTROL_URL="http://localhost:${GATEWAY_PORT}/"
DZZENOS_URL="http://localhost:${GATEWAY_PORT}/__openclaw__/canvas/dzzenos/"
SSH_TUNNEL_CMD="ssh -N -L ${GATEWAY_PORT}:${HOST}:${GATEWAY_PORT} root@<server-ip>"

if [ $JSON_MODE -eq 1 ]; then
  # Minimal JSON (no secrets beyond what OpenClaw already stores locally).
  # Note: token may be present locally; we include it so an agent can return exact URLs.
  node - <<'NODE'
const token = process.env.TOKEN || '';
const control = process.env.CONTROL_URL;
const dzzenos = process.env.DZZENOS_URL;
const ssh = process.env.SSH_TUNNEL_CMD;
const out = {
  ok: true,
  installDir: process.env.INSTALL_DIR,
  repoUrl: process.env.REPO_URL,
  gateway: {
    host: process.env.HOST,
    port: Number(process.env.GATEWAY_PORT || '18789'),
    controlUrl: token ? `${control}?token=${token}` : control,
    dzzenosUrl: token ? `${dzzenos}?token=${token}` : dzzenos,
    tokenPresent: Boolean(token)
  },
  sshTunnelCommand: ssh
};
process.stdout.write(JSON.stringify(out, null, 2));
NODE
  exit 0
fi

info "If OpenClaw runs on a remote server, create an SSH tunnel from your laptop:" 
info "  ${SSH_TUNNEL_CMD}"

if [ -n "$TOKEN" ]; then
  ok "Open Control UI: ${CONTROL_URL}?token=${TOKEN}"
  ok "Open DzzenOS UI : ${DZZENOS_URL}?token=${TOKEN}"
else
  ok "Open Control UI: ${CONTROL_URL}"
  ok "Open DzzenOS UI : ${DZZENOS_URL}"
  warn "If your gateway requires a token, append ?token=..."
fi

echo
ok "Install complete."
