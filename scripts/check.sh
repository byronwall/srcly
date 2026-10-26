#!/usr/bin/env bash
# Run the checks CI's `build` job runs, stopping at the first failure.
#
#   scripts/check.sh            every area
#   scripts/check.sh --changed  only areas that differ from origin/main (the pre-push hook)
#   scripts/check.sh client     named areas: client, engine, server
#
# The `browser` job (cd client && pnpm e2e) is not included; run it for UI or data-flow changes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT_DIR/scripts/bootstrap.sh" >/dev/null

areas=()
if [ "${1:-}" = "--changed" ]; then
  base="$(git -C "$ROOT_DIR" merge-base HEAD origin/main 2>/dev/null || echo origin/main)"
  changed="$(git -C "$ROOT_DIR" diff --name-only "$base" HEAD)"
  for area in client engine server; do
    if grep -q "^$area/" <<<"$changed"; then areas+=("$area"); fi
  done
  # The engine's contracts and Python helper are read by server and client tests.
  if grep -q "^engine/" <<<"$changed"; then
    for area in client server; do
      [[ " ${areas[*]-} " == *" $area "* ]] || areas+=("$area")
    done
  fi
elif [ $# -gt 0 ]; then
  areas=("$@")
else
  areas=(client engine server)
fi

for area in "${areas[@]-}"; do
  case "$area" in
    client)
      echo "==> client: typecheck, test"
      (cd "$ROOT_DIR/client" && pnpm -s typecheck && pnpm -s test)
      ;;
    engine)
      echo "==> engine: typecheck, lint, test"
      (cd "$ROOT_DIR/engine" && pnpm -s typecheck && pnpm -s lint && pnpm -s test)
      ;;
    server)
      echo "==> server: ruff, pytest"
      (cd "$ROOT_DIR/server" && uv run --locked ruff check && uv run --locked pytest -q)
      ;;
    "") ;;
    *)
      echo "unknown area: $area (client, engine, server)" >&2
      exit 2
      ;;
  esac
done
echo "==> checks passed: ${areas[*]-none}"
