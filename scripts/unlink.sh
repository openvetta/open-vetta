#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/coding-agent"
PACKAGE_NAME="@vetta/coding-agent"
BUN_BIN="${BUN_BIN:-bun}"

if [[ ! -d "$PACKAGE_DIR" ]]; then
	echo "Error: coding-agent package directory not found: $PACKAGE_DIR"
	exit 1
fi

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
	echo "Error: bun is not installed or not in PATH."
	exit 1
fi

echo "Unlinking $PACKAGE_NAME globally with bun..."
if ! "$BUN_BIN" unlink -g "$PACKAGE_NAME"; then
	echo "Notice: global link for $PACKAGE_NAME was not present."
fi

echo "Removing local link registration..."
cd "$PACKAGE_DIR"
if ! "$BUN_BIN" unlink; then
	echo "Notice: local link registration was not present."
fi

echo ""
echo "Done. Global link removed for $PACKAGE_NAME."
