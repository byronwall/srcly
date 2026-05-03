#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVER_PORT="${SERVER_PORT:-8000}"
CLIENT_PORT="${CLIENT_PORT:-5173}"
SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
CLIENT_HOST="${CLIENT_HOST:-127.0.0.1}"

check_and_kill_port() {
  port="$1"

  if ! command -v lsof >/dev/null 2>&1; then
    echo "Warning: 'lsof' not found, cannot check port $port."
    return
  fi

  # Only match local listening processes. Plain `lsof -i :8000` can also match
  # established outbound connections whose remote service name resolves to 8000.
  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [ -n "$pids" ]; then
    echo "Detected processes using port $port:"
    lsof -nP -iTCP:"$port" -sTCP:LISTEN
    printf "Do you want to kill these processes on port %s? [y/N] " "$port"
    read ans
    case "$ans" in
      y|Y|yes|YES)
        echo "$pids" | xargs -n1 kill -9
        ;;
      *)
        echo "Leaving processes on port $port running."
        ;;
    esac
  fi
}

cleanup() {
  trap - INT TERM EXIT
  if [ "${server_pid:-}" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
  if [ "${client_pid:-}" ]; then
    kill "$client_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap cleanup INT TERM EXIT

check_and_kill_port "$SERVER_PORT"
check_and_kill_port "$CLIENT_PORT"

echo "Starting API server on http://$SERVER_HOST:$SERVER_PORT"
(
  cd "$ROOT_DIR/server"
  uv run python -m uvicorn app.main:app --reload --host "$SERVER_HOST" --port "$SERVER_PORT"
) &
server_pid="$!"

echo "Starting Vite dev server on http://$CLIENT_HOST:$CLIENT_PORT"
(
  cd "$ROOT_DIR/client"
  pnpm run dev --host "$CLIENT_HOST" --port "$CLIENT_PORT"
) &
client_pid="$!"

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$client_pid" 2>/dev/null; do
  sleep 1
done

wait "$server_pid" "$client_pid"
