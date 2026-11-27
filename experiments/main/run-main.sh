#!/usr/bin/env bash
# The main run. Writes the matrix (if absent), dry-runs it, runs it, and puts every worker's git history back.
# Resumable: run it again and finished runs are skipped. Stop with Ctrl-C (the run in progress is redone on resume).
#   experiments/main/run-main.sh RUNS_DIR [make-matrix.mjs options...]
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${1:?usage: run-main.sh RUNS_DIR [make-matrix options]}; shift
PY=$HOME/q2q3-venv/bin/python
mkdir -p "$OUT"
[ -f "$OUT/matrix.json" ] || node "$ROOT/experiments/main/make-matrix.mjs" --out "$OUT" "$@" > "$OUT/matrix.json" || exit 1
node "$ROOT/experiments/main/dry-run.mjs" --matrix "$OUT/matrix.json" > "$OUT/dry-run.txt" || { cat "$OUT/dry-run.txt"; exit 1; }
head -1 "$OUT/dry-run.txt"
git -C "$ROOT" rev-parse HEAD > "$OUT/revision.txt"; git -C "$ROOT" status --porcelain >> "$OUT/revision.txt"
node "$ROOT/tools/agent-runner/batch.mjs" --matrix "$OUT/matrix.json" 2>&1 | tee -a "$OUT/batch.log"
node -e 'for (const w of require(process.argv[1]).workers) console.log(w.pilotDir + " " + w.pilotPrivate)' "$OUT/matrix.json" |
  while read -r D P; do PILOT_DIR=$D PILOT_PRIVATE=$P "$PY" "$ROOT/q2q3-tools/harness.py" restore 0 || true; done
