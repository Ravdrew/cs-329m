#!/usr/bin/env bash
# Stage 2 of the pilot: one benchmark task on real Cal.com, one run per condition, graded by the PR's hidden tests.
# See ../TESTING.md. Every step can be re-run; finished runs are skipped.
#
#   bash tools/agent-runner/pilot/calcom-pilot.sh
#
# Env (all optional):
#   TASK=24207                       benchmark task (benchmark/tasks.json)
#   CONDITIONS=prose,text,tool       conditions to run, one repeat each
#   GRAPH=graphs/booking-hotstart-2026-10-29-run02.yaml
#                                    graph for text/tool. No per-task edited graphs exist yet, so this is UNEDITED:
#                                    the agent is told "no requested change". It tests the pipeline, not the edit effect.
#   PILOT_DIR=~/q2q3-pilot           Cal.com checkout (PILOT_DIR/calcom, ~5 GB) and env.sh
#   PILOT_PRIVATE=~/q2q3-pilot-private  hidden git history and grading results (keep out of the agent's reach)
#   OUT=~/q2q3-pilot-runs            run directories and summary.csv
#   PYTHON=$PILOT_DIR/venv/bin/python   created with PyYAML if missing
#   SKIP_PREPARE=1                   reuse a prepared checkout (prepare reinstalls; ~5-10 min)
#   SKIP_CHECK=1                     skip the gold-patch sanity check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# shellcheck source=../../../targets/calcom.env
source "$ROOT/targets/calcom.env"
TASK="${TASK:-24207}"
CONDITIONS="${CONDITIONS:-prose,text,tool}"
GRAPH="$(cd "$ROOT" && node -p 'require("path").resolve(process.argv[1])' "${GRAPH:-graphs/booking-hotstart-2026-10-29-run02.yaml}")"
PILOT_DIR="${PILOT_DIR:-$HOME/q2q3-pilot}"
PILOT_PRIVATE="${PILOT_PRIVATE:-$HOME/q2q3-pilot-private}"
OUT="${OUT:-$HOME/q2q3-pilot-runs}"
PYTHON="${PYTHON:-$PILOT_DIR/venv/bin/python}"
export PILOT_DIR PILOT_PRIVATE

step() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
harness() { "$PYTHON" "$ROOT/q2q3-tools/harness.py" "$@"; }

step "Checking prerequisites"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)' \
  || die "the runner needs Node 22.19+ on PATH (found $(node -v)); e.g. nvm use 22"
[[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]] || die "nvm not found; Cal.com's Node 20 is selected through nvm (env-macos.sh)"
bash -c ". \"${NVM_DIR:-$HOME/.nvm}/nvm.sh\" --no-use && nvm ls 20 >/dev/null" || die "no Node 20 in nvm: nvm install 20"
[[ -s "$HOME/.pi/agent/auth.json" || -n "${OPENAI_API_KEY:-}" ]] || die "no Pi credentials: run Pi's /login openai (TESTING.md)"
[[ -f "$GRAPH" ]] || die "graph not found: $GRAPH"
git -C "$ROOT" diff --quiet -- q2q3-tools tools || echo "note: uncommitted changes in q2q3-tools/ or tools/ will be used"

step "Python with PyYAML ($PYTHON)"
if ! "$PYTHON" -c 'import yaml' 2>/dev/null; then
  python3 -m venv "$PILOT_DIR/venv"
  "$PILOT_DIR/venv/bin/pip" install -q pyyaml
  PYTHON="$PILOT_DIR/venv/bin/python"
fi

step "Runner dependencies"
[[ -d "$ROOT/tools/graph-mcp/node_modules/@earendil-works" ]] || npm ci --prefix "$ROOT/tools/graph-mcp"

step "Pilot directory $PILOT_DIR"
mkdir -p "$PILOT_DIR" "$PILOT_PRIVATE" "$OUT"
[[ -f "$PILOT_DIR/env.sh" ]] || cp "$ROOT/q2q3-tools/env/env-macos.sh" "$PILOT_DIR/env.sh"
if [[ ! -d "$PILOT_DIR/calcom/.git" && ! -d "$PILOT_PRIVATE/calcom.git-hidden" ]]; then
  echo "cloning $CALCOM_REPO (blobless: full history, file contents fetched on demand)"
  git clone --filter=blob:none --no-checkout "$CALCOM_REPO" "$PILOT_DIR/calcom"
fi

# Whatever happens below, put the real git history back so the checkout is a normal clone again.
trap 'step "Restoring git history"; harness restore "$TASK" || true' EXIT

if [[ -z "${SKIP_PREPARE:-}" ]]; then
  step "Preparing task $TASK: checkout of the base commit, yarn install, generated clients (5-10 min)"
  harness prepare "$TASK"
fi

if [[ -z "${SKIP_CHECK:-}" ]]; then
  step "Sanity check: the PR's tests fail at the base commit and pass with the real PR (runs the tests twice)"
  harness check "$TASK"
  "$PYTHON" - "$PILOT_PRIVATE/results/$TASK-check.json" <<'EOF'
import json, sys
c = json.load(open(sys.argv[1]))
print(f"FAIL_TO_PASS: {c['f2p']} tests; passing at base: {c['pass_at_base']}; passing with the real PR: {c['pass_with_gold_patch']}")
if c['pass_at_base'] != 0 or c['pass_with_gold_patch'] != c['f2p']:
    sys.exit('the task does not grade cleanly on this machine; see the check JSON above before running agents')
EOF
fi

step "Agent runs: $CONDITIONS (one each, up to 45 min and \$10 per run)"
MATRIX="$OUT/matrix-$TASK.json"
TASK="$TASK" CONDITIONS="$CONDITIONS" GRAPH="$GRAPH" OUT="$OUT" PYTHON="$PYTHON" MATRIX="$MATRIX" node -e '
const e = process.env;
require("fs").writeFileSync(e.MATRIX, JSON.stringify({
  out: e.OUT, tasks: [Number(e.TASK)], conditions: e.CONDITIONS.split(","), repeats: 1, seed: 329,
  inputs: { [e.TASK]: { base: e.GRAPH, edit: e.GRAPH } },
  workers: [{ pilotDir: e.PILOT_DIR, pilotPrivate: e.PILOT_PRIVATE }],
  python: e.PYTHON, effort: "medium", maxMinutes: 45, maxToolCalls: 300, maxCostUsd: 10, skipPrepare: true,
}, null, 2));'
node "$ROOT/tools/agent-runner/batch.mjs" --matrix "$MATRIX"

step "Summary ($OUT/summary.csv)"
column -s, -t < "$OUT/summary.csv" | cut -c1-200
echo
echo "Per run: $OUT/$TASK/<condition>-r1/ (run.json, prompt.md, events.jsonl, audit.json, evaluation.json)"
