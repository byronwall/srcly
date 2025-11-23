#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

# Optionally load environment variables from .env (if present)
if [ -f ".env" ]; then
  echo "==> Loading environment from .env"
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

TARGET="${1:-prod}"  # "prod" (default) or "test"

if [ "$TARGET" = "test" ]; then
  INDEX_URL="https://test.pypi.org/simple"
  TOKEN_VAR="TEST_PYPI_TOKEN"
  echo "==> Publishing srcly to TestPyPI"
else
  INDEX_URL=""
  TOKEN_VAR="PYPI_TOKEN"
  echo "==> Publishing srcly to PyPI"
fi

# Resolve token from env
TOKEN="${!TOKEN_VAR:-}"
if [ -z "${TOKEN}" ]; then
  echo "Error: $TOKEN_VAR is not set. Set it in your environment or .env first." >&2
  exit 1
fi

echo "==> Building srcly (frontend + Python package)"
"$ROOT_DIR/build-srcly.sh"

echo "==> Publishing srcly"
cd "$ROOT_DIR/server"

if [ -n "$INDEX_URL" ]; then
  uv publish --index-url "$INDEX_URL" --token "$TOKEN"
else
  uv publish --token "$TOKEN"
fi

echo "✅ Finished publishing srcly ($TARGET)"


