#!/usr/bin/env bash
# Before the main run: for every task, prepare the checkout (with the CodeGraph index), run harness.py check (the PR's
# tests fail at base and pass with the real PR's source changes), then restore. No model calls.
#   experiments/main/prepcheck.sh [PULL...]        results: $PILOT_PRIVATE/results/PULL-check.json, log on stdout
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
export PILOT_DIR=${PILOT_DIR:-$HOME/q2q3-pilot} PILOT_PRIVATE=${PILOT_PRIVATE:-$HOME/q2q3-main/prepcheck-private}
PY=${PY:-$HOME/q2q3-venv/bin/python}
OUT=${OUT:-$HOME/q2q3-main/prepcheck}
mkdir -p "$PILOT_PRIVATE" "$OUT"
TASKS=${*:-$(node -e 'console.log(Object.keys(require(process.argv[1])).join(" "))' "$ROOT/q2q3-tools/test_fairness.json")}
for T in $TASKS; do
  echo "== $T $(date +%H:%M:%S)"
  if ! "$PY" "$ROOT/q2q3-tools/harness.py" prepare "$T" --codegraph > "$OUT/prepare-$T.log" 2>&1; then
    echo "  prepare FAILED: $(tail -1 "$OUT/prepare-$T.log")"; "$PY" "$ROOT/q2q3-tools/harness.py" restore "$T"; continue
  fi
  echo "  $(grep -E 'install|codegraph index' "$OUT/prepare-$T.log" | tr '\n' ' ')"
  if "$PY" "$ROOT/q2q3-tools/harness.py" check "$T" > "$OUT/check-$T.log" 2>&1; then
    node -e 'const r=require(process.argv[1]); console.log(`  F2P ${r.f2p}: base passes ${r.pass_at_base}, gold passes ${r.pass_with_gold_patch}${r.gold_execution_error ? " ERROR " + r.gold_execution_error : ""}`)' "$PILOT_PRIVATE/results/$T-check.json"
  else
    echo "  check FAILED: $(tail -1 "$OUT/check-$T.log")"
  fi
  "$PY" "$ROOT/q2q3-tools/harness.py" restore "$T" > /dev/null
done
echo "== done $(date +%H:%M:%S)"
