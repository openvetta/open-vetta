#!/usr/bin/env bash
#
# Build monorepo packages in dependency order.
#
# Usage:
#   ./scripts/build.sh          # build all packages
#   ./scripts/build.sh lib      # build libraries only (no apps)
#   ./scripts/build.sh app      # build apps only (assumes libs are built)
#   ./scripts/build.sh desktop  # build desktop-app and its deps
#   ./scripts/build.sh cli      # build cli-app and its deps
#   ./scripts/build.sh admin    # build admin panel
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'

build_pkg() {
  local dir="$1"
  local name
  name=$(basename "$dir")
  printf "${DIM}[build]${RESET} %-24s" "$name"
  if (cd "$dir" && bun run build > /dev/null 2>&1); then
    printf "${GREEN}ok${RESET}\n"
  else
    printf "${RED}FAIL${RESET}\n"
    echo "  Re-running with output:"
    (cd "$dir" && bun run build)
    exit 1
  fi
}

# ── Layer 0: no workspace deps ──
build_layer0() {
  build_pkg packages/ai
  build_pkg packages/runtime-telemetry
  build_pkg packages/agent
  build_pkg packages/action-rpc
  build_pkg packages/plugin-sdk
  build_pkg packages/plugin-vite
}

# ── Layer 1: depends on layer 0 ──
build_layer1() {
  build_pkg packages/coding-agent
}

# ── Layer 2: depends on coding-agent ──
build_layer2() {
  build_pkg packages/runtime-core
  build_pkg packages/runtime-tools
  build_pkg packages/runtime-storage
  build_pkg packages/runtime-mcp
  build_pkg packages/web-ui
}

# ── Layer 3: apps (depends on runtime-core) ──
build_apps() {
  build_pkg packages/cli-app
  build_pkg packages/desktop-app
}

build_admin() {
  build_pkg packages/admin
}

build_libs() {
  build_layer0
  build_layer1
  build_layer2
}

build_all() {
  build_libs
  build_apps
  build_admin
}

case "${1:-all}" in
  all)     build_all ;;
  lib|libs) build_libs ;;
  app|apps) build_apps ;;
  desktop)  build_libs && build_apps ;;
  cli)      build_libs && build_pkg packages/cli-app ;;
  admin)    build_admin ;;
  *)
    echo "Unknown target: $1"
    echo "Usage: $0 [all|libs|apps|desktop|cli|admin]"
    exit 1
    ;;
esac

printf "\n${GREEN}Done.${RESET}\n"
