#!/usr/bin/env bash
# Install what a fresh checkout or worktree needs: client and engine node_modules,
# the server venv, and the repo's git hooks. Safe to rerun; skips what is present.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for dir in client engine; do
  if [ ! -d "$ROOT_DIR/$dir/node_modules" ]; then
    echo "==> pnpm install ($dir)"
    pnpm -C "$ROOT_DIR/$dir" install --frozen-lockfile
  fi
done

if [ ! -d "$ROOT_DIR/server/.venv" ]; then
  echo "==> uv sync (server)"
  (cd "$ROOT_DIR/server" && uv sync --locked)
fi

# Hooks live in the repo; worktrees share this config with the main checkout.
if [ "$(git -C "$ROOT_DIR" config core.hooksPath || true)" != ".githooks" ]; then
  git -C "$ROOT_DIR" config core.hooksPath .githooks
  echo "==> git hooks: .githooks"
fi
