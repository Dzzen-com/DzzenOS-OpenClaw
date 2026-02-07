#!/usr/bin/env bash
set -euo pipefail

# DzzenOS-OpenClaw installer/updater (release-first)
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --version vX.Y.Z
#   curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --rollback

OWNER_REPO_DEFAULT="Dzzen-com/DzzenOS-OpenClaw"
OWNER_REPO="${OWNER_REPO:-$OWNER_REPO_DEFAULT}"
GITHUB_API="https://api.github.com/repos/$OWNER_REPO"

INSTALL_DIR="${INSTALL_DIR:-$HOME/dzzenos-openclaw}"
STATE_DIR="${INSTALL_STATE_DIR:-$INSTALL_DIR.state}"
ROLLBACKS_DIR="$STATE_DIR/rollbacks"
KEEP_ROLLBACKS="${KEEP_ROLLBACKS:-4}"

OPENCLAW_CONFIG_PATH_DEFAULT="$HOME/.openclaw/openclaw.json"
OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$OPENCLAW_CONFIG_PATH_DEFAULT}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"

HOST_DEFAULT="127.0.0.1"
GATEWAY_PORT_DEFAULT="18789"
HOST="${HOST:-$HOST_DEFAULT}"
GATEWAY_PORT="${GATEWAY_PORT:-$GATEWAY_PORT_DEFAULT}"
AUTH_TTL_SECONDS="${AUTH_TTL_SECONDS:-604800}"
AUTH_PASSWORD_POLICY="${AUTH_PASSWORD_POLICY:-strict}"
AUTH_COOKIE_SAMESITE="${AUTH_COOKIE_SAMESITE:-Strict}"

JSON_MODE=0
ROLLBACK_ONLY=0
ASSUME_YES=0
REQUESTED_VERSION="${DZZENOS_VERSION:-}"
INSTALL_MODE="${INSTALL_MODE:-auto}" # auto|server|docker|cloudflare
UI_PROFILE="${DZZENOS_UI_PROFILE:-}"  # local|domain
SETUP_DOMAIN_OVERRIDE="" # yes|no|""

DOMAIN="${DOMAIN:-}"
DOMAIN_EMAIL="${EMAIL:-}"
AUTH_USERNAME="${USERNAME:-}"
AUTH_PASSWORD="${PASSWORD:-}"

CURRENT_ACTION="install"
CURRENT_VERSION=""
PREV_VERSION=""
RELEASE_NAME=""
RELEASE_URL=""
RELEASE_PUBLISHED_AT=""
RELEASE_SHA256=""
ACTIVE_UI_PROFILE=""
APPLIED_MODE=""
DID_DOMAIN_SETUP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --json)
      JSON_MODE=1
      ;;
    --rollback)
      ROLLBACK_ONLY=1
      ;;
    --version)
      REQUESTED_VERSION="${2:-}"
      shift
      ;;
    --mode)
      INSTALL_MODE="${2:-}"
      shift
      ;;
    --ui-profile)
      UI_PROFILE="${2:-}"
      shift
      ;;
    --yes)
      ASSUME_YES=1
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      STATE_DIR="${INSTALL_DIR}.state"
      ROLLBACKS_DIR="$STATE_DIR/rollbacks"
      shift
      ;;
    --owner-repo)
      OWNER_REPO="${2:-}"
      GITHUB_API="https://api.github.com/repos/$OWNER_REPO"
      shift
      ;;
    --keep-rollbacks)
      KEEP_ROLLBACKS="${2:-}"
      shift
      ;;
    --domain)
      DOMAIN="${2:-}"
      SETUP_DOMAIN_OVERRIDE="yes"
      shift
      ;;
    --domain-email)
      DOMAIN_EMAIL="${2:-}"
      shift
      ;;
    --username)
      AUTH_USERNAME="${2:-}"
      shift
      ;;
    --password)
      AUTH_PASSWORD="${2:-}"
      shift
      ;;
    --no-domain)
      SETUP_DOMAIN_OVERRIDE="no"
      ;;
    -h|--help)
      cat <<'USAGE'
DzzenOS installer

Options:
  --version <tag>        Install/update a specific GitHub release tag (default: latest release)
  --rollback             Roll back to latest rollback snapshot
  --mode <mode>          auto|server|docker|cloudflare (local disabled)
  --ui-profile <value>   local|domain (build routing profile)
  --domain <name>        Enable/setup domain mode (server mode)
  --domain-email <mail>  Email for TLS cert (optional)
  --username <name>      Login username for domain mode
  --password <pass>      Login password for domain mode
  --no-domain            Force skip domain setup
  --install-dir <path>   Target install directory
  --keep-rollbacks <n>   Rollback snapshots to keep (default 4)
  --json                 JSON output mode for automation
  --yes                  Non-interactive defaults
USAGE
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$JSON_MODE" -eq 0 ] && [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; RED='\033[31m'; GRN='\033[32m'; YLW='\033[33m'; BLU='\033[34m'; CYN='\033[36m'; RST='\033[0m'
else
  BOLD=''; DIM=''; RED=''; GRN=''; YLW=''; BLU=''; CYN=''; RST=''
fi

phase() {
  [ "$JSON_MODE" -eq 1 ] && return 0
  local n="$1"; shift
  local total="$1"; shift
  echo -e "${BOLD}${BLU}[${n}/${total}]${RST} ${BOLD}$*${RST}"
}

info() { [ "$JSON_MODE" -eq 1 ] || echo -e "${DIM} • $*${RST}"; }
ok() { [ "$JSON_MODE" -eq 1 ] || echo -e "${GRN}✔${RST} $*"; }
warn() { [ "$JSON_MODE" -eq 1 ] || echo -e "${YLW}!${RST} $*"; }
err() { [ "$JSON_MODE" -eq 1 ] || echo -e "${RED}✖${RST} $*" >&2; }

die() {
  err "$*"
  exit 1
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

ensure_dir() {
  mkdir -p "$1"
}

timestamp_utc() {
  date -u +"%Y%m%dT%H%M%SZ"
}

sha256_file() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
    return
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$f" | awk '{print $NF}'
    return
  fi
  die "No sha256 tool available (sha256sum/shasum/openssl)"
}

check_node_version() {
  local major
  major=$(node -p 'Number(process.versions.node.split(".")[0])')
  if [ "$major" -lt 22 ]; then
    die "Node 22+ is required (found $(node -v))"
  fi
}

check_openclaw_installed() {
  if command -v openclaw >/dev/null 2>&1; then
    return 0
  fi
  if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
    return 0
  fi

  cat >&2 <<'EOF'
OpenClaw was not detected on this server.
Install OpenClaw first, then run DzzenOS installer again.

Docs:
  https://docs.openclaw.ai/start/getting-started

Install command:
  curl -fsSL https://openclaw.ai/install.sh | bash
EOF
  exit 1
}

read_current_version() {
  if [ -f "$INSTALL_DIR/.dzzenos-release-tag" ]; then
    cat "$INSTALL_DIR/.dzzenos-release-tag"
    return
  fi
  echo "unknown"
}

detect_mode() {
  case "$INSTALL_MODE" in
    server|docker|cloudflare)
      echo "$INSTALL_MODE"
      return
      ;;
    local)
      die "Local mode is disabled. Use a VPS/server for always-on autonomous operation. Guide: https://dzzen.com/dzzenos/openclaw"
      ;;
    auto)
      ;;
    *)
      die "Invalid --mode: $INSTALL_MODE"
      ;;
  esac

  if [ -f "/.dockerenv" ]; then
    echo "docker"
    return
  fi

  if [ -r /proc/1/cgroup ] && grep -qaE 'docker|containerd|kubepods' /proc/1/cgroup; then
    echo "docker"
    return
  fi

  if [ -n "${CF_PAGES:-}" ] || [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -n "${WRANGLER_CI:-}" ]; then
    echo "cloudflare"
    return
  fi

  case "$(uname -s)" in
    Darwin)
      echo "local"
      ;;
    *)
      echo "server"
      ;;
  esac
}

require_non_local_mode() {
  local mode="$1"
  if [ "$mode" = "local" ]; then
    cat >&2 <<'EOF'
Local/laptop install mode is disabled for DzzenOS platform.
Reason: DzzenOS is intended for always-on autonomous operation on a server.

Get a VPS and setup guidance:
  https://dzzen.com/dzzenos/openclaw
EOF
    exit 1
  fi
}

warn_if_gateway_public() {
  if [ ! -f "$OPENCLAW_CONFIG_PATH" ]; then return 0; fi
  local bind
  bind=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH);const v=j?.gateway?.bind??j?.gateway?.host??j?.gateway?.listen??"";process.stdout.write(String(v||""));}catch(e){process.exit(0)}')
  if [ -n "$bind" ] && [ "$bind" != "127.0.0.1" ] && [ "$bind" != "localhost" ] && [ "$bind" != "::1" ]; then
    warn "OpenClaw Gateway bind appears non-loopback ($bind). Recommended: loopback only."
  fi
}

fetch_release_json() {
  local out="$1"
  local endpoint
  if [ -n "$REQUESTED_VERSION" ]; then
    endpoint="$GITHUB_API/releases/tags/$REQUESTED_VERSION"
  else
    endpoint="$GITHUB_API/releases/latest"
  fi
  curl -fsSL -H 'accept: application/vnd.github+json' "$endpoint" > "$out"
}

parse_release_json() {
  local in="$1"
  local idx=0
  CURRENT_VERSION=""
  RELEASE_NAME=""
  RELEASE_TARBALL_URL=""
  RELEASE_URL=""
  RELEASE_PUBLISHED_AT=""
  RELEASE_CHECKSUM_URL=""
  while IFS= read -r line; do
    case "$idx" in
      0) CURRENT_VERSION="$line" ;;
      1) RELEASE_NAME="$line" ;;
      2) RELEASE_TARBALL_URL="$line" ;;
      3) RELEASE_URL="$line" ;;
      4) RELEASE_PUBLISHED_AT="$line" ;;
      5) RELEASE_CHECKSUM_URL="$line" ;;
    esac
    idx=$((idx + 1))
  done < <(node - "$in" <<'NODE'
const fs = require('fs');
const p = process.argv[2];
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const assets = Array.isArray(j.assets) ? j.assets : [];
const checksumAsset = assets.find((a) => /sha256|checksums?/i.test(String(a?.name || '')));
const out = {
  tag: String(j.tag_name || ''),
  name: String(j.name || ''),
  tarball: String(j.tarball_url || ''),
  html: String(j.html_url || ''),
  published: String(j.published_at || ''),
  checksumUrl: String(checksumAsset?.browser_download_url || ''),
};
for (const k of ['tag', 'name', 'tarball', 'html', 'published', 'checksumUrl']) {
  process.stdout.write(`${out[k] || ''}\n`);
}
NODE
)

  [ -n "$CURRENT_VERSION" ] || die "Could not parse release tag from GitHub API"
  [ -n "$RELEASE_TARBALL_URL" ] || die "Could not parse release tarball URL from GitHub API"
}

record_history() {
  ensure_dir "$STATE_DIR"
  printf '%s\t%s\t%s\t%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$1" "$2" "$3" >> "$STATE_DIR/history.log"
}

prune_rollbacks() {
  local keep
  keep="$KEEP_ROLLBACKS"
  if ! [[ "$keep" =~ ^[0-9]+$ ]]; then
    warn "Invalid KEEP_ROLLBACKS=$KEEP_ROLLBACKS, using 4"
    keep=4
  fi
  ensure_dir "$ROLLBACKS_DIR"
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    rm -rf "$s"
  done < <(find "$ROLLBACKS_DIR" -mindepth 1 -maxdepth 1 -type d -print | LC_ALL=C sort -r | awk "NR>$keep")
}

load_saved_ui_profile() {
  if [ -n "$UI_PROFILE" ]; then
    echo "$UI_PROFILE"
    return
  fi
  if [ -f "$STATE_DIR/ui-profile" ]; then
    cat "$STATE_DIR/ui-profile"
    return
  fi
  echo "local"
}

save_ui_profile() {
  ensure_dir "$STATE_DIR"
  printf '%s\n' "$1" > "$STATE_DIR/ui-profile"
}

apply_release_from_tarball() {
  local tarball="$1"
  local extract_dir
  extract_dir="$(mktemp -d /tmp/dzzenos-release-XXXXXX)"
  tar -xzf "$tarball" --strip-components=1 -C "$extract_dir"

  [ -f "$extract_dir/package.json" ] || die "Release payload is missing package.json"
  [ -f "$extract_dir/scripts/setup-domain.sh" ] || die "Release payload is missing scripts/setup-domain.sh"

  local current_before
  current_before=""
  if [ -d "$INSTALL_DIR" ]; then
    local legacy_data_dir="$INSTALL_DIR/data"
    local legacy_db="$legacy_data_dir/dzzenos.db"
    local legacy_workspace="$legacy_data_dir/workspace"
    local next_legacy_data_dir="$extract_dir/data"
    local next_legacy_db="$next_legacy_data_dir/dzzenos.db"
    local next_legacy_workspace="$next_legacy_data_dir/workspace"
    local carried_legacy_data=0

    if [ -f "$legacy_db" ] && [ ! -f "$next_legacy_db" ]; then
      ensure_dir "$next_legacy_data_dir"
      cp -f "$legacy_db" "$next_legacy_db"
      for suffix in -wal -shm; do
        local legacy_aux="${legacy_db}${suffix}"
        [ -f "$legacy_aux" ] || continue
        cp -f "$legacy_aux" "${next_legacy_db}${suffix}"
      done
      carried_legacy_data=1
    fi

    if [ -d "$legacy_workspace" ] && [ ! -d "$next_legacy_workspace" ]; then
      ensure_dir "$next_legacy_data_dir"
      cp -R "$legacy_workspace" "$next_legacy_workspace"
      carried_legacy_data=1
    fi

    if [ "$carried_legacy_data" -eq 1 ]; then
      warn "Detected legacy repo data in $legacy_data_dir; carried it forward into the new release payload to prevent upgrade data loss."
    fi

    current_before="$(read_current_version)"
    local snap="$ROLLBACKS_DIR/$(timestamp_utc)_${current_before}"
    ensure_dir "$ROLLBACKS_DIR"
    mv "$INSTALL_DIR" "$snap"
    PREV_VERSION="$current_before"
    record_history "snapshot" "$current_before" "moved-to:$snap"
  fi

  ensure_dir "$(dirname "$INSTALL_DIR")"
  mv "$extract_dir" "$INSTALL_DIR"

  printf '%s\n' "$CURRENT_VERSION" > "$INSTALL_DIR/.dzzenos-release-tag"
  cat > "$INSTALL_DIR/.dzzenos-release-meta.json" <<META
{
  "version": "${CURRENT_VERSION}",
  "name": "${RELEASE_NAME}",
  "publishedAt": "${RELEASE_PUBLISHED_AT}",
  "releaseUrl": "${RELEASE_URL}",
  "sourceSha256": "${RELEASE_SHA256}",
  "installedAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
META

  record_history "activate" "$CURRENT_VERSION" "$RELEASE_SHA256"
  ensure_dir "$STATE_DIR"
  printf '%s\n' "$CURRENT_VERSION" > "$STATE_DIR/current-version"
  printf '%s\n' "$RELEASE_SHA256" > "$STATE_DIR/current-source-sha256"

  prune_rollbacks
}

perform_rollback() {
  ensure_dir "$ROLLBACKS_DIR"
  local target
  target="$(find "$ROLLBACKS_DIR" -mindepth 1 -maxdepth 1 -type d -print | LC_ALL=C sort -r | head -n 1)"
  if [ -z "$target" ]; then
    die "No rollback snapshots found in $ROLLBACKS_DIR"
  fi
  local prev_name
  prev_name="$(basename "$target")"

  if [ -d "$INSTALL_DIR" ]; then
    local cur="$(read_current_version)"
    local cur_snap="$ROLLBACKS_DIR/$(timestamp_utc)_rollback-from-${cur}"
    mv "$INSTALL_DIR" "$cur_snap"
    record_history "snapshot" "$cur" "moved-to:$cur_snap"
  fi

  mv "$target" "$INSTALL_DIR"

  if [ -f "$INSTALL_DIR/.dzzenos-release-tag" ]; then
    CURRENT_VERSION="$(cat "$INSTALL_DIR/.dzzenos-release-tag")"
  else
    CURRENT_VERSION="$prev_name"
  fi

  PREV_VERSION="rollback"
  CURRENT_ACTION="rollback"
  RELEASE_SHA256="$(cat "$STATE_DIR/current-source-sha256" 2>/dev/null || true)"

  record_history "rollback" "$CURRENT_VERSION" "from:$prev_name"
  ensure_dir "$STATE_DIR"
  printf '%s\n' "$CURRENT_VERSION" > "$STATE_DIR/current-version"

  prune_rollbacks
}

choose_domain_setup() {
  local mode="$1"
  if [ "$mode" != "server" ]; then
    echo "no"
    return
  fi

  if [ "$SETUP_DOMAIN_OVERRIDE" = "yes" ]; then
    echo "yes"
    return
  fi
  if [ "$SETUP_DOMAIN_OVERRIDE" = "no" ]; then
    echo "no"
    return
  fi

  if [ "$ASSUME_YES" -eq 1 ] || [ "$JSON_MODE" -eq 1 ]; then
    echo "no"
    return
  fi

  warn_if_gateway_public
  read -r -p "Set up secure domain access (Caddy + TLS + login page)? [y/N] " ans
  if [[ "${ans:-}" =~ ^[Yy]$ ]]; then
    echo "yes"
  else
    echo "no"
  fi
}

check_password_strict() {
  local p="$1"
  if [ ${#p} -lt 12 ]; then return 1; fi
  if ! [[ "$p" =~ [A-Z] ]]; then return 1; fi
  if ! [[ "$p" =~ [a-z] ]]; then return 1; fi
  if ! [[ "$p" =~ [0-9] ]]; then return 1; fi
  if ! [[ "$p" =~ [^A-Za-z0-9] ]]; then return 1; fi
  return 0
}

collect_domain_inputs_if_needed() {
  local setup_domain="$1"
  if [ "$setup_domain" != "yes" ]; then
    return
  fi

  if [ -z "$DOMAIN" ] && [ "$JSON_MODE" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
    read -r -p "Domain (e.g. dzzenos.example.com): " DOMAIN
  fi
  if [ -z "$DOMAIN_EMAIL" ] && [ "$JSON_MODE" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
    read -r -p "Email for Let's Encrypt (optional): " DOMAIN_EMAIL
  fi
  if [ -z "$AUTH_USERNAME" ] && [ "$JSON_MODE" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
    read -r -p "Login username: " AUTH_USERNAME
  fi
  if [ -z "$AUTH_PASSWORD" ] && [ "$JSON_MODE" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
    while true; do
      read -r -s -p "Login password (min 12 chars, upper/lower/number/symbol): " AUTH_PASSWORD
      echo
      if [ "$AUTH_PASSWORD_POLICY" = "strict" ]; then
        if check_password_strict "$AUTH_PASSWORD"; then
          break
        fi
        warn "Password too weak. Try again."
      else
        break
      fi
    done
  fi

  [ -n "$DOMAIN" ] || die "DOMAIN is required for domain setup"
  [ -n "$AUTH_USERNAME" ] || die "USERNAME is required for domain setup"
  [ -n "$AUTH_PASSWORD" ] || die "PASSWORD is required for domain setup"
}

publish_ui() {
  local profile="$1"
  if [ "$profile" = "domain" ]; then
    DZZENOS_API_BASE="/dzzenos-api" VITE_OPENCLAW_PATH="/openclaw" OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" \
      corepack pnpm dzzenos:canvas:publish
  else
    VITE_OPENCLAW_PATH="/" OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" \
      corepack pnpm dzzenos:canvas:publish
  fi
}

emit_json_result() {
  local token=""
  if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
    token=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH);process.stdout.write(j?.gateway?.auth?.token||"");}catch(e){process.exit(0)}')
  fi
  local control_url="http://localhost:${GATEWAY_PORT}/"
  local dzzenos_url="http://localhost:${GATEWAY_PORT}/__openclaw__/canvas/dzzenos/"
  ACTION="$CURRENT_ACTION" \
  VERSION="$CURRENT_VERSION" \
  PREVIOUS_VERSION="$PREV_VERSION" \
  INSTALL_DIR="$INSTALL_DIR" \
  STATE_DIR="$STATE_DIR" \
  MODE="$APPLIED_MODE" \
  UI_PROFILE="$ACTIVE_UI_PROFILE" \
  DID_DOMAIN_SETUP="$DID_DOMAIN_SETUP" \
  RELEASE_NAME="$RELEASE_NAME" \
  RELEASE_URL="$RELEASE_URL" \
  RELEASE_PUBLISHED_AT="$RELEASE_PUBLISHED_AT" \
  RELEASE_SHA256="$RELEASE_SHA256" \
  HOST="$HOST" \
  GATEWAY_PORT="$GATEWAY_PORT" \
  TOKEN="$token" \
  CONTROL_URL="$control_url" \
  DZZENOS_URL="$dzzenos_url" \
  OWNER_REPO="$OWNER_REPO" \
  ROLLBACKS_DIR="$ROLLBACKS_DIR" \
  node - <<'NODE'
const token = process.env.TOKEN || '';
const control = process.env.CONTROL_URL || '';
const dzzenos = process.env.DZZENOS_URL || '';
const out = {
  ok: true,
  action: process.env.ACTION || '',
  version: process.env.VERSION || '',
  previousVersion: process.env.PREVIOUS_VERSION || '',
  installDir: process.env.INSTALL_DIR || '',
  stateDir: process.env.STATE_DIR || '',
  mode: process.env.MODE || '',
  uiProfile: process.env.UI_PROFILE || '',
  didDomainSetup: Number(process.env.DID_DOMAIN_SETUP || '0') === 1,
  release: {
    name: process.env.RELEASE_NAME || '',
    url: process.env.RELEASE_URL || '',
    publishedAt: process.env.RELEASE_PUBLISHED_AT || '',
    sourceSha256: process.env.RELEASE_SHA256 || '',
  },
  gateway: {
    host: process.env.HOST || '',
    port: Number(process.env.GATEWAY_PORT || '0'),
    controlUrl: token ? `${control}?token=${token}` : control,
    dzzenosUrl: token ? `${dzzenos}?token=${token}` : dzzenos,
    tokenPresent: Boolean(token),
  },
  rollback: {
    command: `curl -fsSL https://raw.githubusercontent.com/${process.env.OWNER_REPO}/main/scripts/install.sh | bash -s -- --rollback`,
    snapshotsDir: process.env.ROLLBACKS_DIR || '',
  },
};
process.stdout.write(JSON.stringify(out, null, 2));
NODE
}

print_summary() {
  [ "$JSON_MODE" -eq 1 ] && return 0
  local token=""
  if [ -f "$OPENCLAW_CONFIG_PATH" ]; then
    token=$(node -e 'try{const j=require(process.env.OPENCLAW_CONFIG_PATH);process.stdout.write(j?.gateway?.auth?.token||"");}catch(e){process.exit(0)}')
  fi

  local control_url="http://localhost:${GATEWAY_PORT}/"
  local dzzenos_url="http://localhost:${GATEWAY_PORT}/__openclaw__/canvas/dzzenos/"

  echo
  echo -e "${BOLD}${CYN}DzzenOS ${CURRENT_ACTION} summary${RST}"
  echo -e "  version:        ${BOLD}${CURRENT_VERSION}${RST}"
  [ -n "$PREV_VERSION" ] && echo -e "  previous:       ${PREV_VERSION}"
  echo -e "  install dir:    ${INSTALL_DIR}"
  echo -e "  state dir:      ${STATE_DIR}"
  echo -e "  mode/profile:   ${APPLIED_MODE} / ${ACTIVE_UI_PROFILE}"
  [ -n "$RELEASE_SHA256" ] && echo -e "  source sha256:  ${RELEASE_SHA256}"
  [ -n "$RELEASE_URL" ] && echo -e "  release page:   ${RELEASE_URL}"

  echo
  if [ -n "$token" ]; then
    ok "Open Control UI: ${control_url}?token=${token}"
    ok "Open DzzenOS UI : ${dzzenos_url}?token=${token}"
  else
    ok "Open Control UI: ${control_url}"
    ok "Open DzzenOS UI : ${dzzenos_url}"
  fi

  if [ "$DID_DOMAIN_SETUP" -eq 1 ]; then
    ok "Domain login: https://${DOMAIN}/login"
    ok "Domain dashboard: https://${DOMAIN}/dashboard"
  fi

  echo
  info "Rollback command: curl -fsSL https://raw.githubusercontent.com/$OWNER_REPO/main/scripts/install.sh | bash -s -- --rollback"
  info "DB backup CLI:    bash ${INSTALL_DIR}/scripts/dzzenos-admin.sh db backup list"
}

main() {
  if [ "$JSON_MODE" -eq 0 ]; then
    echo -e "${BOLD}${CYN}DzzenOS-OpenClaw Installer${RST}"
    info "target: $INSTALL_DIR"
    info "repo:   $OWNER_REPO"
  fi

  phase 1 7 "Preflight"
  need_cmd curl
  need_cmd tar
  need_cmd node
  need_cmd corepack
  check_node_version
  check_openclaw_installed
  ensure_dir "$STATE_DIR"
  ensure_dir "$ROLLBACKS_DIR"
  ok "Environment checks passed"

  APPLIED_MODE="$(detect_mode)"
  require_non_local_mode "$APPLIED_MODE"
  if [ "$JSON_MODE" -eq 0 ]; then
    info "detected mode: $APPLIED_MODE"
  fi

  if [ "$ROLLBACK_ONLY" -eq 1 ]; then
    phase 2 7 "Rollback release"
    perform_rollback
    ok "Rolled back to snapshot version: $CURRENT_VERSION"
  else
    phase 2 7 "Resolve release"
    local release_json
    release_json="$(mktemp /tmp/dzzenos-release-meta-XXXXXX.json)"
    fetch_release_json "$release_json"
    parse_release_json "$release_json"
    CURRENT_ACTION="install"
    if [ -d "$INSTALL_DIR" ]; then
      CURRENT_ACTION="update"
    fi
    ok "Resolved release: $CURRENT_VERSION"

    phase 3 7 "Download release"
    local tarball
    tarball="$(mktemp /tmp/dzzenos-release-XXXXXX.tgz)"
    curl -fL "$RELEASE_TARBALL_URL" -o "$tarball"
    RELEASE_SHA256="$(sha256_file "$tarball")"
    ok "Downloaded source tarball"
    info "sha256: $RELEASE_SHA256"

    if [ -n "${RELEASE_CHECKSUM_URL:-}" ]; then
      local checksums
      checksums="$(mktemp /tmp/dzzenos-release-checksums-XXXXXX.txt)"
      if curl -fsSL "$RELEASE_CHECKSUM_URL" -o "$checksums"; then
        if grep -qi "$RELEASE_SHA256" "$checksums"; then
          ok "Release checksum asset includes downloaded source hash"
        else
          warn "Checksum asset exists but does not contain source tarball hash"
        fi
      else
        warn "Failed to download checksum asset: $RELEASE_CHECKSUM_URL"
      fi
    else
      warn "No checksum asset found on release; using computed source hash for audit"
    fi

    phase 4 7 "Apply release"
    apply_release_from_tarball "$tarball"
    ok "Release activated"
  fi

  ACTIVE_UI_PROFILE="$(load_saved_ui_profile)"

  local setup_domain
  setup_domain="$(choose_domain_setup "$APPLIED_MODE")"

  if [ "$setup_domain" = "yes" ]; then
    ACTIVE_UI_PROFILE="domain"
  elif [ -z "$ACTIVE_UI_PROFILE" ]; then
    ACTIVE_UI_PROFILE="local"
  fi

  if [ "$ACTIVE_UI_PROFILE" != "local" ] && [ "$ACTIVE_UI_PROFILE" != "domain" ]; then
    warn "Invalid UI profile '$ACTIVE_UI_PROFILE', falling back to local"
    ACTIVE_UI_PROFILE="local"
  fi

  phase 5 7 "Install dependencies"
  (
    cd "$INSTALL_DIR"
    corepack enable >/dev/null 2>&1 || true
    corepack pnpm install --frozen-lockfile
  )
  ok "Dependencies installed"

  phase 6 7 "Build + publish UI"
  (
    cd "$INSTALL_DIR"
    publish_ui "$ACTIVE_UI_PROFILE"
  )
  ok "UI published to OpenClaw canvas"

  if [ "$setup_domain" = "yes" ]; then
    phase 7 7 "Setup domain mode"
    collect_domain_inputs_if_needed "$setup_domain"

    if [ "$JSON_MODE" -eq 0 ]; then
      echo
      echo -e "${BOLD}DNS setup (required)${RST}"
      info "1) Create an A record: ${DOMAIN} -> <your-server-public-ip>"
      info "2) Wait for DNS propagation"
      if command -v getent >/dev/null 2>&1; then
        info "DNS check: resolving $DOMAIN..."
        getent ahosts "$DOMAIN" | head -n 3 || true
      fi
    fi

    sudo -n true 2>/dev/null || warn "May prompt for sudo password (Caddy + systemd setup)."

    DOMAIN="$DOMAIN" EMAIL="$DOMAIN_EMAIL" USERNAME="$AUTH_USERNAME" PASSWORD="$AUTH_PASSWORD" \
      OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG_PATH" GATEWAY_PORT="$GATEWAY_PORT" REPO_DIR="$INSTALL_DIR" \
      AUTH_TTL_SECONDS="$AUTH_TTL_SECONDS" AUTH_PASSWORD_POLICY="$AUTH_PASSWORD_POLICY" AUTH_COOKIE_SAMESITE="$AUTH_COOKIE_SAMESITE" \
      sudo -E bash "$INSTALL_DIR/scripts/setup-domain.sh"

    DID_DOMAIN_SETUP=1
    ok "Domain setup complete"
  else
    phase 7 7 "Finalize"
    ok "No domain setup requested"
  fi

  save_ui_profile "$ACTIVE_UI_PROFILE"

  if [ "$JSON_MODE" -eq 1 ]; then
    emit_json_result
  else
    print_summary
  fi
}

main "$@"
