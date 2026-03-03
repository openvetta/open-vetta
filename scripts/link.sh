#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/coding-agent"
PACKAGE_NAME="@mariozechner/pi-coding-agent"

if [[ ! -d "$PACKAGE_DIR" ]]; then
	echo "Error: coding-agent package directory not found: $PACKAGE_DIR"
	exit 1
fi

echo "Building coding-agent..."
cd "$PACKAGE_DIR"
npm run build

echo "Linking @mariozechner/pi-coding-agent globally..."
cd "$PACKAGE_DIR"

# Clean stale global install/link leftovers that can cause ENOTDIR during rename.
GLOBAL_ROOT="$(npm root -g)"
GLOBAL_SCOPE_DIR="$GLOBAL_ROOT/@mariozechner"
GLOBAL_TARGET="$GLOBAL_SCOPE_DIR/pi-coding-agent"

echo "Cleaning previous global link/install (if any)..."
npm unlink -g "$PACKAGE_NAME" >/dev/null 2>&1 || true

if [[ -d "$GLOBAL_SCOPE_DIR" ]]; then
	node -e "const fs=require('fs'); const p=process.argv[1]; try{ if(fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true}); }catch{}" "$GLOBAL_TARGET"
	node -e "const fs=require('fs'); const d=process.argv[1]; try{ if(!fs.existsSync(d)) process.exit(0); for(const n of fs.readdirSync(d)){ if(n.startsWith('.pi-coding-agent-')) fs.rmSync(require('path').join(d,n),{recursive:true,force:true}); } }catch{}" "$GLOBAL_SCOPE_DIR"
fi

npm link

echo ""
echo "Done. You can now run 'vetta' from any directory."
echo "Check: vetta --help"
