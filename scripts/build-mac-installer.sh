#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Building Safepath for macOS (release + DMG)…"
echo "This runs: npm run tauri:build"
echo ""

npm run tauri:build

DMG_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
APP_DIR="$ROOT/src-tauri/target/release/bundle/macos"

echo ""
echo "Done. Artifacts:"
if [[ -d "$DMG_DIR" ]]; then
  ls -1 "$DMG_DIR"/*.dmg 2>/dev/null || true
fi
if [[ -d "$APP_DIR" ]]; then
  echo "App bundle: $APP_DIR/Safepath.app"
fi

echo ""
echo "Open the DMG folder:"
echo "  open \"$DMG_DIR\""
