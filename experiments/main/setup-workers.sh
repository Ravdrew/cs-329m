#!/usr/bin/env bash
# Make parallel workers for the main run: APFS clones (cp -c, instant and copy-on-write) of the prepared pilot
# checkout ~/q2q3-pilot as ~/q2q3-pilot-w1 ... Each worker re-runs prepare (yarn install etc.) for its own tasks,
# so nothing in a clone needs fixing. Run only when no harness command is using ~/q2q3-pilot and its history is
# restored (calcom/.git is the real clone).
#   experiments/main/setup-workers.sh [N=3]
set -euo pipefail
N=${1:-3}
SRC=$HOME/q2q3-pilot
[ -f "$SRC/calcom/.git/packed-refs" ] || [ -d "$SRC/calcom/.git/objects/pack" ] || { echo "$SRC/calcom/.git is not the real clone: run harness.py restore first"; exit 1; }
for i in $(seq 1 $((N - 1))); do
  D=$HOME/q2q3-pilot-w$i
  if [ -e "$D" ]; then echo "$D exists, kept"; continue; fi
  cp -cR "$SRC" "$D" && echo "$D cloned"
done
