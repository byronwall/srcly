#!/usr/bin/env bash
# Run one dev server on this checkout's ports (scripts/dev-ports.sh).
#
#   scripts/dev-server.sh api      uvicorn with --reload and the engine from source
#   scripts/dev-server.sh client   Vite, proxying /api to this checkout's API
#
# .claude/launch.json (written by scripts/bootstrap.sh) runs these for preview_start.
# dev.sh still runs both in one terminal on 8000/5173.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT_DIR/scripts/bootstrap.sh" >/dev/null
read -r api_port client_port < <("$ROOT_DIR/scripts/dev-ports.sh")

case "${1:-}" in
  api)
    cd "$ROOT_DIR/server"
    # Run the data-flow engine from engine/ source (see AGENTS.md "Engine").
    export SRCLY_ENGINE_DEV="${SRCLY_ENGINE_DEV:-1}"
    exec uv run python -m uvicorn app.main:app --reload --timeout-graceful-shutdown 3 \
      --host 127.0.0.1 --port "$api_port"
    ;;
  client)
    cd "$ROOT_DIR/client"
    export SRCLY_API_PORT="$api_port"
    exec pnpm exec vite --host 127.0.0.1 --port "$client_port" --strictPort
    ;;
  *)
    echo "usage: scripts/dev-server.sh api|client" >&2
    exit 2
    ;;
esac
