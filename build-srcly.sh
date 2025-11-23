#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
STATIC_DIR="$SERVER_DIR/app/static"

echo "==> Building srcly client (frontend)"
cd "$CLIENT_DIR"

# Install dependencies if needed, then build the SPA
if [ ! -d "node_modules" ]; then
  echo "   Installing client dependencies with pnpm..."
  pnpm install
fi

echo "   Running pnpm build..."
pnpm build

echo "==> Syncing client build into Python package (app/static)"
rm -rf "$STATIC_DIR"
mkdir -p "$STATIC_DIR"
cp -R "$CLIENT_DIR/dist/"* "$STATIC_DIR/"

echo "==> Building srcly Python package with uv"
cd "$SERVER_DIR"
uv build

echo "✅ Done. Built srcly frontend and Python package."


