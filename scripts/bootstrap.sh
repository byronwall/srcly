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

# preview_start reads .claude/launch.json. Its ports differ per worktree, so it is
# generated here rather than committed; delete it to regenerate.
launch="$ROOT_DIR/.claude/launch.json"
if [ ! -f "$launch" ]; then
  read -r api_port client_port < <("$ROOT_DIR/scripts/dev-ports.sh")
  mkdir -p "$ROOT_DIR/.claude"
  cat >"$launch" <<EOF
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "srcly-api",
      "runtimeExecutable": "bash",
      "runtimeArgs": ["scripts/dev-server.sh", "api"],
      "port": $api_port
    },
    {
      "name": "srcly-client",
      "runtimeExecutable": "bash",
      "runtimeArgs": ["scripts/dev-server.sh", "client"],
      "port": $client_port
    }
  ]
}
EOF
  echo "==> .claude/launch.json: api $api_port, client $client_port"
fi

# Hooks live in the repo; worktrees share this config with the main checkout.
if [ "$(git -C "$ROOT_DIR" config core.hooksPath || true)" != ".githooks" ]; then
  git -C "$ROOT_DIR" config core.hooksPath .githooks
  echo "==> git hooks: .githooks"
fi
