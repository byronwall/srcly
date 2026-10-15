#!/usr/bin/env bash
# Capture a dependency graph from a running srcly server into a local,
# gitignored fixture for the layout tests (client/src/viz/deps/layout.test.ts).
#
#   scripts/capture-dep-graph.sh <repo> [focus ...]
#
# <repo>   absolute path of the repo the server should read
# focus    graph ids (repo-relative folders/files) the tests lay out; "" is the root
#
# Writes client/src/viz/deps/__fixtures__/local/<repo-name>.json. That folder is
# gitignored: captures of private repos must never be committed.
# SRCLY_API (default http://localhost:8000) points at the server.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <repo> [focus ...]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${SRCLY_API:-http://localhost:8000}"
REPO="$1"
shift
NAME="$(basename "$REPO")"
OUT_DIR="$ROOT_DIR/client/src/viz/deps/__fixtures__/local"
mkdir -p "$OUT_DIR"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

curl -fsS --get --data-urlencode "path=$REPO" "$API/api/analysis/dependency-graph" -o "$TMP"
python3 - "$TMP" "$OUT_DIR/$NAME.json" "$NAME" "$@" <<'PY'
import json, sys
src, out, name, *foci = sys.argv[1:]
graph = json.load(open(src))
with open(out, "w") as f:
    json.dump({"name": name, "foci": foci, "graph": graph}, f)
print(f"wrote {out}: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges, foci={foci}")
PY
