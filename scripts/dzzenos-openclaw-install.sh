#!/usr/bin/env bash
set -euo pipefail

# Branded installer wrapper.
# Intended URL example:
#   https://dzzen.com/dzzenos-openclaw-install.sh
#
# Usage:
#   curl -fsSL https://dzzen.com/dzzenos-openclaw-install.sh | bash
#   curl -fsSL https://dzzen.com/dzzenos-openclaw-install.sh | bash -s -- --version v1.2.3

curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- "$@"
