#!/usr/bin/env bash
# Print this checkout's dev ports as `API CLIENT`.
#
# The main checkout uses 8000 and 5173. Each worktree gets its own stable pair,
# derived from its path, so worktrees run side by side and every client proxies
# to its own worktree's API. SRCLY_API_PORT / SRCLY_CLIENT_PORT override either.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(git -C "$ROOT_DIR" rev-parse --git-dir)" = "$(git -C "$ROOT_DIR" rev-parse --git-common-dir)" ]; then
  api=8000
  client=5173
else
  offset=$(( $(printf '%s' "$ROOT_DIR" | cksum | cut -d' ' -f1) % 800 ))
  api=$(( 18100 + offset ))
  client=$(( 15100 + offset ))
fi

echo "${SRCLY_API_PORT:-$api} ${SRCLY_CLIENT_PORT:-$client}"
