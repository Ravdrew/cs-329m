#!/usr/bin/env bash
# Run the repository's pinned CodeGraph CLI from any working directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/tools/codegraph/node_modules/.bin/codegraph"

if [[ ! -x "$CLI" ]]; then
  echo "CodeGraph is not installed. Run: npm ci --prefix \"$ROOT/tools/codegraph\"" >&2
  exit 1
fi

exec "$CLI" "$@"
