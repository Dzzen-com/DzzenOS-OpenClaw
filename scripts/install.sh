#!/usr/bin/env bash
set -euo pipefail

REPO_URL_DEFAULT="https://github.com/Dzzen-com/DzzenOS-OpenClaw.git"
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/dzzenos-openclaw}"

OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

log() { echo "[dzzenos-install] $*"; }

if ! command -v git >/dev/null 2>&1; then
  log "git is required"; exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  log "node is required (>=22 recommended)"; exit 1
fi
if ! command -v corepack >/dev/null 2>&1; then
  log "corepack is required (ships with node)."; exit 1
fi

log "Cloning repo into: $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  (cd "$INSTALL_DIR" && git pull --rebase)
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

log "Enabling corepack"
corepack enable >/dev/null 2>&1 || true

log "Installing dependencies"
corepack pnpm install --frozen-lockfile

log "Publishing DzzenOS UI to OpenClaw Canvas host"
# If OPENCLAW_STATE_DIR is set, publish-canvas will use it.
export OPENCLAW_STATE_DIR
corepack pnpm dzzenos:canvas:publish

log "Done."

# Print open URLs
TOKEN=""
if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
  TOKEN=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH||"'$OPENCLAW_CONFIG_PATH'");console.log(j?.gateway?.auth?.token||"");}catch(e){process.exit(0)}')
fi

CONTROL_URL="http://localhost:18789/"
DZZENOS_URL="http://localhost:18789/__openclaw__/canvas/dzzenos/"

log "Next: create an SSH tunnel to your gateway host (if remote):"
log "  ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>"

if [ -n "$TOKEN" ]; then
  log "Open Control UI: ${CONTROL_URL}?token=${TOKEN}"
  log "Open DzzenOS UI : ${DZZENOS_URL}?token=${TOKEN}"
else
  log "Open Control UI: ${CONTROL_URL}"
  log "Open DzzenOS UI : ${DZZENOS_URL}"
  log "(If your gateway requires a token, append ?token=...)")
fi

log "If you installed via an agent, paste the DzzenOS link into the chat and pin it." 
