#!/usr/bin/env bash
# Reproduce the booking-scoped structural and component CodeGraph baseline.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/work/calcom"
COMMIT="54343aa685ae8f33159d2f485ec4a57bad5c574a"
REPO="https://github.com/calcom/cal.com.git"

bash "$ROOT/scripts/codegraph.sh" --version
if [[ ! -d "$SOURCE/.git" ]]; then
  git clone --no-checkout --filter=blob:none --depth 1 "$REPO" "$SOURCE"
else
  if [[ -n "$(git -C "$SOURCE" status --porcelain --untracked-files=no)" ]]; then
    echo "Refusing to change a checkout with tracked modifications: $SOURCE" >&2
    exit 1
  fi
fi
if [[ "$(git -C "$SOURCE" rev-parse HEAD)" != "$COMMIT" || ! -f "$SOURCE/package.json" ]]; then
  git -C "$SOURCE" fetch --depth 1 "$REPO" "$COMMIT"
  git -C "$SOURCE" checkout --detach "$COMMIT"
fi

if [[ -f "$SOURCE/.codegraph/codegraph.db" ]]; then
  bash "$ROOT/scripts/codegraph.sh" index "$SOURCE"
else
  bash "$ROOT/scripts/codegraph.sh" init --yes "$SOURCE"
fi
bash "$ROOT/scripts/codegraph.sh" components "$SOURCE" \
  --config "$ROOT/tools/codegraph/booking.config.json" \
  --raw-out "$ROOT/work/calcom-booking-structural.json" \
  --out "$ROOT/graphs/codegraph-booking"
cp "$ROOT/graphs/codegraph-booking/components.json" \
  "$ROOT/viewer/public/graphs/codegraph-booking-components.json"
echo "Viewer: http://localhost:5173/?graph=/graphs/codegraph-booking-components.json"
