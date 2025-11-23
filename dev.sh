#!/bin/sh

check_and_kill_port() {
  port="$1"

  if ! command -v lsof >/dev/null 2>&1; then
    echo "Warning: 'lsof' not found, cannot check port $port."
    return
  fi

  # Get PIDs listening on the port (if any)
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"

  if [ -n "$pids" ]; then
    echo "Detected processes using port $port:"
    lsof -i :"$port"
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

check_and_kill_port 8000
check_and_kill_port 5173

pnpm dlx concurrently -k -n "server,client" -c "blue,green" \
  "cd server && uv run uvicorn app.main:app --reload --port 8000" \
  "cd client && pnpm dev"
