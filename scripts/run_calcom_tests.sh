#!/usr/bin/env bash
# Run Cal.com's Vitest unit tests and save JSON results.
#
# Usage: scripts/run_calcom_tests.sh [--mode unit|timezone|integration] [--out FILE] [test files...]
#   --mode   unit (default): the main suite, TZ=UTC, as in Cal.com CI
#            timezone: *.timezone.test.ts under TZ=America/Los_Angeles, as in CI
#            integration: *.integration-test.ts (needs Postgres; not set up yet)
#   --out    results file (default: results/runs/<sha>-<mode>-<timestamp>.json)
#   files    optional test files or filters passed to vitest; omit for the full suite
#
# Env:
#   CALCOM_DIR  checkout to test (default: work/calcom in this repo)
#
# Exits with vitest's exit code; results are written even when tests fail.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${CALCOM_DIR:-$ROOT/work/calcom}"
MODE=unit
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
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
  integration) export TZ=UTC VITEST_MODE=integration ;;
  *) echo "error: unknown mode $MODE" >&2; exit 1 ;;
esac

sha="$(git -C "$DIR" rev-parse --short HEAD)"
if [[ -z "$OUT" ]]; then
  OUT="$ROOT/results/runs/${sha}-${MODE}-$(date +%Y%m%d-%H%M%S).json"
fi
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

echo "==> Running $MODE tests at $sha -> $OUT"
cd "$DIR"
start=$(date +%s)
status=0
# Call vitest directly (not `yarn test`) so this script controls TZ and flags.
# Cal.com CI passes --no-isolate, but on a 10-core Mac that made ~560 tests fail
# from state leaking between files (e.g. "Prismock not initialized yet"); with
# isolation the suite passes cleanly, so we keep vitest's default.
corepack yarn vitest run \
  --reporter=default --reporter=json --outputFile.json="$OUT" "$@" || status=$?

echo "==> vitest exited $status after $(( $(date +%s) - start ))s"
node "$ROOT/scripts/summarize_results.mjs" "$OUT" || true
exit "$status"
