#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

# Path to Python package metadata
PYPROJECT_FILE="$ROOT_DIR/server/pyproject.toml"

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
  echo "==> Publishing srcly (TestPyPI)"
else
  INDEX_URL=""
  TOKEN_VAR="PYPI_TOKEN"
  echo "==> Publishing srcly (PyPI)"
fi

# Resolve token from env
TOKEN="${!TOKEN_VAR:-}"
if [ -z "${TOKEN}" ]; then
  echo "Error: $TOKEN_VAR is not set. Set it in your environment or .env first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Automatically bump Python package version (patch) in pyproject.toml
# ---------------------------------------------------------------------------
if [ ! -f "$PYPROJECT_FILE" ]; then
  echo "Error: pyproject.toml not found at $PYPROJECT_FILE" >&2
  exit 1
fi

CURRENT_VERSION_LINE="$(grep '^version = "' "$PYPROJECT_FILE" || true)"
if [ -z "$CURRENT_VERSION_LINE" ]; then
  echo 'Error: Could not find a line starting with: version = "<version>" in pyproject.toml' >&2
  exit 1
fi

CURRENT_VERSION="$(printf '%s\n' "$CURRENT_VERSION_LINE" | sed -E 's/^version = "([^"]+)".*/\1/')"

if ! printf '%s' "$CURRENT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: CURRENT_VERSION '$CURRENT_VERSION' is not in MAJOR.MINOR.PATCH format" >&2
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

echo "==> Bumping Python package version: $CURRENT_VERSION -> $NEW_VERSION"

tmp_pyproject="$(mktemp)"
sed -E "s/^version = \"${CURRENT_VERSION}\"/version = \"${NEW_VERSION}\"/" "$PYPROJECT_FILE" > "$tmp_pyproject"
mv "$tmp_pyproject" "$PYPROJECT_FILE"

echo "==> Building srcly (frontend + Python package) at version $NEW_VERSION"
"$ROOT_DIR/build-srcly.sh"

echo "==> Publishing srcly"
cd "$ROOT_DIR/server"

if [ -n "$INDEX_URL" ]; then
  uv publish --index-url "$INDEX_URL" --token "$TOKEN"
else
  uv publish --token "$TOKEN"
fi

echo "✅ Finished publishing srcly ($TARGET)"


