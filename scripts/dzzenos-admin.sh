#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
DzzenOS admin helper

Usage:
  scripts/dzzenos-admin.sh db backup create [--db PATH] [--backup-dir DIR] [--name NAME] [--json]
  scripts/dzzenos-admin.sh db backup list [--db PATH] [--backup-dir DIR] [--json]
  scripts/dzzenos-admin.sh db backup restore --file FILE [--db PATH] [--backup-dir DIR] [--json]
  scripts/dzzenos-admin.sh upgrade rollback [--install-dir DIR] [--json]
USAGE
}

if [ $# -lt 1 ]; then
  usage
  exit 2
fi

case "$1" in
  db)
    shift
    if [ "${1:-}" != "backup" ]; then
      usage
      exit 2
    fi
    shift
    exec node --experimental-strip-types "$ROOT_DIR/skills/dzzenos/db/backup.ts" "$@"
    ;;
  upgrade)
    shift
    if [ "${1:-}" != "rollback" ]; then
      usage
      exit 2
    fi
    shift
    exec bash "$ROOT_DIR/scripts/install.sh" --rollback "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
