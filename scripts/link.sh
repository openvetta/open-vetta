#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/coding-agent"
PACKAGE_NAME="@mariozechner/pi-coding-agent"
BUN_BIN="${BUN_BIN:-bun}"

if [[ ! -d "$PACKAGE_DIR" ]]; then
	echo "Error: coding-agent package directory not found: $PACKAGE_DIR"
	exit 1
fi

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
	echo "Error: bun is not installed or not in PATH."
	exit 1
fi

echo "Ensuring workspace dependencies with bun..."
cd "$ROOT_DIR"
if ! "$BUN_BIN" install; then
	echo ""
	echo "Error: bun install failed."
	echo "Please run 'bun install' in $ROOT_DIR and fix install errors first."
	exit 1
fi

echo "Building workspace dependencies (tui, ai, agent)..."
for dep_pkg in tui ai agent; do
	echo "  - $dep_pkg"
	cd "$ROOT_DIR/packages/$dep_pkg"
	if [[ "$dep_pkg" == "ai" ]]; then
		echo "    (offline: skip model fetching)"
		"$BUN_BIN" run tsgo -p tsconfig.build.json
	else
		"$BUN_BIN" run build
	fi
done

echo "Building coding-agent with bun..."
cd "$PACKAGE_DIR"
"$BUN_BIN" run build

echo "Linking $PACKAGE_NAME globally with bun..."

# Register current package as linkable and link it globally.
"$BUN_BIN" link
"$BUN_BIN" link -g "$PACKAGE_NAME"

BUN_GLOBAL_BIN="$("$BUN_BIN" pm bin -g 2>/dev/null || true)"
if [[ -n "$BUN_GLOBAL_BIN" ]]; then
	echo "Bun global bin: $BUN_GLOBAL_BIN"
fi

echo ""
echo "Done. You can now run 'vetta' from any directory."
echo "Check: vetta --help"
