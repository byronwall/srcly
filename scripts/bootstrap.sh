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
# generated here rather than committed; delete it to regenerate. A new worktree
# can start with a copy of another checkout's file (fixed ports, no data-flow
# engine). Only that exact old srcly config is replaced: its entries are the
# old srcly-api (uv run … uvicorn on 8000) and srcly-client (vite on 5173),
# key for key. Any other file is yours and is kept.
launch="$ROOT_DIR/.claude/launch.json"
if [ -f "$launch" ] && ! grep -q "scripts/dev-server.sh" "$launch"; then
  if python3 -c '
import json, sys
entries = json.load(open(sys.argv[1])).get("configurations", [])
old = [
    {"name": "srcly-api", "runtimeExecutable": "uv", "runtimeArgs": ["run", "--directory", "server", "uvicorn", "app.main:app", "--reload", "--port", "8000"], "port": 8000},
    {"name": "srcly-client", "runtimeExecutable": "./client/node_modules/.bin/vite", "runtimeArgs": ["client", "--port", "5173"], "port": 5173},
]
sys.exit(0 if entries and all(e in old for e in entries) else 1)
' "$launch" 2>/dev/null; then
    echo "==> .claude/launch.json is the old srcly config (fixed ports, no data-flow engine): replacing it"
    rm "$launch"
  else
    echo "==> .claude/launch.json does not run scripts/dev-server.sh; keeping it. Delete it to get this worktree's ports and the engine."
  fi
fi
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
