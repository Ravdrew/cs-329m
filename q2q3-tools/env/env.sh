export PATH=/home/claude/pilot/bin:$(echo "$PATH" | tr ":" "\n" | grep -v -e "^/opt/node22/bin$" -e "npm-global" | paste -sd:)
export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt YARN_HTTPS_PROXY=$HTTPS_PROXY YARN_CA_FILE_PATH=/root/.ccr/ca-bundle.crt YARN_ENABLE_TELEMETRY=0
export PRISMA_SCHEMA_ENGINE_BINARY=/home/claude/pilot/fake-schema-engine PRISMA_QUERY_ENGINE_LIBRARY=/home/claude/pilot/fake-libquery.so.node PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 CHECKPOINT_DISABLE=1
export TZ=UTC
yarnb() { node "$(git rev-parse --show-toplevel)/.yarn/releases/$(ls "$(git rev-parse --show-toplevel)/.yarn/releases" | head -1)" "$@"; }
export PATH=$PATH:/home/claude/pilot/calcom/node_modules/.bin
