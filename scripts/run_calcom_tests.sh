#!/usr/bin/env bash
# Run Cal.com's tests and save JSON results.
#
# Usage: scripts/run_calcom_tests.sh [--mode MODE] [--out FILE] [--no-reset] [test files...]
#   --mode   unit (default): the main Vitest suite, TZ=UTC, as in Cal.com CI
#            timezone: *.timezone.test.ts under TZ=America/Los_Angeles, as in CI
#            integration: *.integration-test.ts against Postgres (Vitest)
#            api-e2e: apps/api/v2 *.e2e-spec.ts against Postgres and Redis (Jest)
#   --out    results file (default: results/runs/<sha>-<mode>-<timestamp>.json)
#   --no-reset  for integration and api-e2e, skip restoring the seeded database
#               snapshot before the run (by default every run starts clean)
#   files    optional test files or filters; omit for the full suite. For
#            api-e2e, paths may be given from the Cal.com root or from apps/api/v2.
#
# integration and api-e2e need the database: run scripts/db.sh up first.
#
# Env:
#   CALCOM_DIR  checkout to test (default: work/calcom in this repo)
#
# Exits with the test runner's exit code; results are written even when tests fail.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${CALCOM_DIR:-$ROOT/work/calcom}"
MODE=unit
OUT=""
RESET=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --no-reset) RESET=0; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) break ;;
  esac
done

if [[ ! -d "$DIR/node_modules" ]]; then
  echo "error: $DIR is not set up; run scripts/setup_calcom.sh first" >&2
  exit 1
fi

case "$MODE" in
  unit) export TZ=UTC; unset VITEST_MODE ;;
  timezone) export TZ=America/Los_Angeles VITEST_MODE=timezone ;;
  integration) export TZ=UTC VITEST_MODE=integration INTEGRATION_TESTS=true ;;
  api-e2e) export TZ=UTC; unset VITEST_MODE ;;
  *) echo "error: unknown mode $MODE" >&2; exit 1 ;;
esac

if [[ "$MODE" == integration || "$MODE" == api-e2e ]]; then
  export CALCOM_DIR="$DIR"
  if [[ "$RESET" == 1 ]]; then
    "$ROOT/scripts/db.sh" reset
  fi
  eval "$("$ROOT/scripts/db.sh" env)"
fi

sha="$(git -C "$DIR" rev-parse --short HEAD)"
if [[ -z "$OUT" ]]; then
  OUT="$ROOT/results/runs/${sha}-${MODE}-$(date +%Y%m%d-%H%M%S).json"
fi
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

echo "==> Running $MODE tests at $sha -> $OUT"
cd "$DIR"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
start=$(date +%s)
status=0

if [[ "$MODE" == api-e2e ]]; then
  cd apps/api/v2
  # The API imports compiled platform packages. Build them once per commit
  # (Cal.com's own `yarn test:e2e` rebuilds them on every run).
  marker="$DIR/.git/cs329m-platform-build-sha"  # inside .git so the checkout stays clean
  if [[ "$(cat "$marker" 2>/dev/null)" != "$(git -C "$DIR" rev-parse HEAD)" ]]; then
    echo "==> Building platform packages for the API (once per commit, several minutes)"
    corepack yarn dev:build
    git -C "$DIR" rev-parse HEAD > "$marker"
  fi
  files=()
  for f in "$@"; do files+=("${f#apps/api/v2/}"); done
  # Jest's JSON output has the same shape as Vitest's, so the summarizer reads both.
  NODE_OPTIONS="--max_old_space_size=8192 --experimental-vm-modules" \
    corepack yarn jest --ci --forceExit --config ./jest-e2e.ts \
    --json --outputFile="$OUT" ${files[@]+"${files[@]}"} || status=$?
  echo "==> jest exited $status after $(( $(date +%s) - start ))s"
  node "$ROOT/scripts/summarize_results.mjs" "$OUT" || true
  exit "$status"
fi

# Call vitest directly (not `yarn test`) so this script controls TZ and flags.
# Cal.com CI passes --no-isolate, but on a 10-core Mac that made ~560 tests fail
# from state leaking between files (e.g. "Prismock not initialized yet"); with
# isolation the suite passes cleanly, so we keep vitest's default.
corepack yarn vitest run \
  --reporter=default --reporter=json --outputFile.json="$OUT" "$@" || status=$?

echo "==> vitest exited $status after $(( $(date +%s) - start ))s"
node "$ROOT/scripts/summarize_results.mjs" "$OUT" || true
exit "$status"
