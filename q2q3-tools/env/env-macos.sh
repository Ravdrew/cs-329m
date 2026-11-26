# env.sh for harness.py on a Mac (or any machine with nvm): copy it to $PILOT_DIR/env.sh.
# harness.py and the agent source it before every command. Cal.com needs Node 20, and runs its own bundled Yarn
# through corepack. (env.sh next to this file is the cloud box's version, with its proxy and offline Prisma engines.)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh" --no-use
  nvm use --silent 20 >/dev/null 2>&1 || echo "env.sh: nvm has no Node 20; run: nvm install 20" >&2
fi
case "$(node -v 2>/dev/null)" in
  v20.*) ;;
  *) echo "env.sh: Cal.com needs Node 20, found $(node -v 2>/dev/null || echo none)" >&2 ;;
esac
# `yarn` is Cal.com's own Yarn (packageManager in its package.json), without a global install or prompts.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 YARN_ENABLE_TELEMETRY=0 CHECKPOINT_DISABLE=1 TZ=UTC
yarn() { corepack yarn "$@"; }
export -f yarn
_pilot_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$PATH:$_pilot_dir/calcom/node_modules/.bin"
unset _pilot_dir
