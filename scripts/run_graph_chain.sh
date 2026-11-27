#!/usr/bin/env bash
# Build the per-PR graphs in order, each from the previous one. Usage: run_graph_chain.sh PR [PR ...]
# The first PR's graph must already be in graphs/wide-chain/. Stops at the first failure.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASKS="${BENCH_TASKS:-$ROOT/benchmark/tasks.json}"
RUNS="${RUNS:-$ROOT/../llm-only-runs}"
DIR="$ROOT/graphs/wide-chain"
prev="$1"; shift
for pr in "$@"; do
  if [[ ! -f "$DIR/$pr.yaml" ]]; then
    base="$(python3 -c 'import json,sys; print(next(t["base_commit"] for t in json.load(open(sys.argv[1])) if t["pull_number"]==int(sys.argv[2])))' "$TASKS" "$pr")"
    log="$DIR/.$pr.log"
    if ! bash "$ROOT/scripts/run_llm_only_graph.sh" --scope wide --commit "$base" --seed "$DIR/$prev.yaml" --provider anthropic --model claude-sonnet-5-5 --effort medium --max-tools 600 --max-minutes 45 --output-root "$RUNS" > "$log" 2>&1; then
      tail -2 "$log"; touch "$DIR/.failed"; exit 1
    fi
    run="$(tail -12 "$log" | sed -n 's/.*"run_directory": "\(.*\)".*/\1/p')"
    cp "$run/graph.yaml" "$DIR/$pr.yaml.tmp" && mv "$DIR/$pr.yaml.tmp" "$DIR/$pr.yaml"
    python3 -c 'import json,sys; r=json.load(open(sys.argv[2]+"/run.json")); print(sys.argv[1], r["status"], r["counts"], "pending", r["seed"]["pending"], "cost", round(r["estimated_cost_usd"],2), "min", round(r["elapsed_seconds"]/60,1), r["run_directory"])' "$pr" "$run"
  fi
  prev="$pr"
done
