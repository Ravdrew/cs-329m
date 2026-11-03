#!/usr/bin/env bash
# Clone Cal.com at a pinned commit and install dependencies.
#
# Usage: scripts/setup_calcom.sh [commit-sha]
#   commit-sha  defaults to CALCOM_SHA in targets/calcom.env
#
# Env:
#   CALCOM_DIR  where to put the checkout (default: work/calcom in this repo;
#               on FarmShare use /scratch/users/$USER/calcom)
#
# Works on macOS, Linux and WSL2. Needs git and Node 20 (with corepack).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../targets/calcom.env
source "$ROOT/targets/calcom.env"

SHA="${1:-$CALCOM_SHA}"
DIR="${CALCOM_DIR:-$ROOT/work/calcom}"

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo none)"
if [[ "$node_major" != "$CALCOM_NODE_MAJOR" ]]; then
  echo "error: need Node $CALCOM_NODE_MAJOR, found $node_major (try: nvm use $CALCOM_NODE_MAJOR)" >&2
  exit 1
fi

if [[ ! -d "$DIR/.git" ]]; then
  echo "==> Cloning $CALCOM_REPO into $DIR"
  mkdir -p "$(dirname "$DIR")"
  # Blobless clone: full history (any commit can be checked out) but file
  # contents are fetched lazily, so the clone is small.
  git clone --filter=blob:none --no-checkout "$CALCOM_REPO" "$DIR"
fi

echo "==> Checking out $SHA"
git -C "$DIR" fetch --quiet origin "$SHA" 2>/dev/null || true
git -C "$DIR" checkout --quiet --detach "$SHA"

cd "$DIR"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
start=$(date +%s)

echo "==> yarn install (several minutes on first run)"
corepack yarn install

echo "==> prisma generate"
corepack yarn prisma generate

echo "==> Done in $(( $(date +%s) - start ))s. Cal.com is at $DIR ($(git rev-parse --short HEAD))"
