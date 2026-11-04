#!/usr/bin/env bash
# Postgres and Redis for Cal.com's database-backed tests (integration tests and
# API v2 end-to-end tests).
#
# Usage: scripts/db.sh <command>
#   up      start Postgres and Redis and load a clean seeded database. The first
#           time for a given Cal.com commit this applies migrations, seeds, and
#           saves a snapshot; after that it restores the snapshot (seconds).
#   reset   restore the database to the seeded snapshot (run_calcom_tests.sh
#           does this before every database-backed run)
#   down    stop Postgres and Redis; data and snapshots are kept
#   nuke    stop and delete the database data and all snapshots
#   status  show whether Postgres and Redis are up and which snapshot exists
#   env     print the environment the tests need: eval "$(scripts/db.sh env)"
#
# Env:
#   CALCOM_DIR         Cal.com checkout (default: work/calcom in this repo)
#   DB_BACKEND         docker or native (default: docker if its daemon is
#                      running, otherwise native)
#   CALCOM_DB_PORT     Postgres port (default 5450, Cal.com's own default)
#   CALCOM_REDIS_PORT  Redis port (default 6379)
#   PG_BIN             directory with initdb/pg_ctl/psql for the native backend
#
# docker: needs Docker Desktop or Colima (macOS), or Docker Engine (Linux).
# native: needs Postgres and Redis installed, e.g. on macOS
#   brew install postgresql@18 redis
# and must run as a normal (non-root) user. Data lives in work/db/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${CALCOM_DIR:-$ROOT/work/calcom}"
STATE="$ROOT/work/db"
COMPOSE_FILE="$ROOT/scripts/db/docker-compose.yml"
DB_PORT="${CALCOM_DB_PORT:-5450}"
REDIS_PORT="${CALCOM_REDIS_PORT:-6379}"
DB_NAME=calendso
export CALCOM_DB_PORT="$DB_PORT" CALCOM_REDIS_PORT="$REDIS_PORT"

die() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

if [[ -z "${DB_BACKEND:-}" ]]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DB_BACKEND=docker
  else
    DB_BACKEND=native
  fi
fi
[[ "$DB_BACKEND" == docker || "$DB_BACKEND" == native ]] || die "DB_BACKEND must be docker or native"

print_env() {
  local url="postgresql://postgres@localhost:$DB_PORT/$DB_NAME"
  # The secrets are throwaway test values (the same ones Cal.com's own e2e
  # setup uses in apps/api/v2/test/setEnvVars.ts); existing values win.
  cat <<EOF
export DATABASE_URL="\${DATABASE_URL:-$url}"
export DATABASE_DIRECT_URL="\${DATABASE_DIRECT_URL:-$url}"
export DATABASE_READ_URL="\${DATABASE_READ_URL:-$url}"
export DATABASE_WRITE_URL="\${DATABASE_WRITE_URL:-$url}"
export REDIS_URL="\${REDIS_URL:-redis://localhost:$REDIS_PORT}"
export NEXT_PUBLIC_WEBAPP_URL="\${NEXT_PUBLIC_WEBAPP_URL:-http://localhost:3000}"
export NEXTAUTH_SECRET="\${NEXTAUTH_SECRET:-XF+Hws3A5g2eyWA5uGYYVJ74X+wrCWJ8oWo6kAfU6O8=}"
export CALENDSO_ENCRYPTION_KEY="\${CALENDSO_ENCRYPTION_KEY:-22gfxhWUlcKliUeXcu8xNah2+HP/29ZX}"
EOF
}

# --- backend primitives -------------------------------------------------------

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

find_pg_bin() {
  if [[ -n "${PG_BIN:-}" ]]; then return; fi
  if command -v pg_ctl >/dev/null 2>&1; then PG_BIN="$(dirname "$(command -v pg_ctl)")"; return; fi
  # Homebrew's versioned postgresql formulae are keg-only (not on PATH).
  if command -v brew >/dev/null 2>&1; then
    for v in 18 17 16; do
      local p
      p="$(brew --prefix "postgresql@$v" 2>/dev/null)/bin"
      if [[ -x "$p/pg_ctl" ]]; then PG_BIN="$p"; return; fi
    done
  fi
  # Debian/Ubuntu put the server binaries outside PATH.
  for p in /usr/lib/postgresql/*/bin; do
    if [[ -x "$p/pg_ctl" ]]; then PG_BIN="$p"; fi
  done
  [[ -n "${PG_BIN:-}" ]] || die "Postgres not found; install it (macOS: brew install postgresql@18) or set PG_BIN"
}

# Run a Postgres client tool (psql, pg_dump, pg_restore) against the server.
pg() {
  local tool="$1"; shift
  if [[ "$DB_BACKEND" == docker ]]; then
    dc exec -T postgres "$tool" -U postgres "$@"
  else
    "$PG_BIN/$tool" -h localhost -p "$DB_PORT" -U postgres "$@"
  fi
}

postgres_ready() {
  if [[ "$DB_BACKEND" == docker ]]; then
    dc exec -T postgres pg_isready -U postgres -q 2>/dev/null
  else
    "$PG_BIN/pg_isready" -h localhost -p "$DB_PORT" -q 2>/dev/null
  fi
}

redis_ready() {
  if [[ "$DB_BACKEND" == docker ]]; then
    dc exec -T redis redis-cli ping >/dev/null 2>&1
  else
    redis-cli -p "$REDIS_PORT" ping >/dev/null 2>&1
  fi
}

start_services() {
  if [[ "$DB_BACKEND" == docker ]]; then
    log "Starting Postgres (port $DB_PORT) and Redis (port $REDIS_PORT) in Docker"
    dc up -d --wait
    return
  fi
  [[ "$(id -u)" != 0 ]] || die "the native backend can't run as root (Postgres refuses); use a normal user or Docker"
  command -v redis-server >/dev/null 2>&1 || die "redis-server not found; install Redis (macOS: brew install redis)"
  mkdir -p "$STATE"
  if [[ ! -f "$STATE/pgdata/PG_VERSION" ]]; then
    log "Creating a Postgres data directory in $STATE/pgdata"
    "$PG_BIN/initdb" -D "$STATE/pgdata" -U postgres --auth=trust >/dev/null
  fi
  if ! "$PG_BIN/pg_ctl" -D "$STATE/pgdata" status >/dev/null 2>&1; then
    log "Starting Postgres on port $DB_PORT"
    # The socket goes in /tmp because macOS limits socket paths to ~100 chars.
    "$PG_BIN/pg_ctl" -D "$STATE/pgdata" -l "$STATE/postgres.log" -w \
      -o "-p $DB_PORT -k /tmp -c listen_addresses=localhost" start >/dev/null \
      || die "Postgres didn't start; see $STATE/postgres.log (is port $DB_PORT in use?)"
  fi
  if ! redis_ready; then
    log "Starting Redis on port $REDIS_PORT"
    redis-server --port "$REDIS_PORT" --daemonize yes --save "" --appendonly no \
      --pidfile "$STATE/redis.pid" --logfile "$STATE/redis.log" \
      || die "Redis didn't start; see $STATE/redis.log"
    for _ in $(seq 20); do redis_ready && break; sleep 0.5; done
  fi
}

stop_services() {
  if [[ "$DB_BACKEND" == docker ]]; then
    dc stop
    return
  fi
  if [[ -f "$STATE/pgdata/PG_VERSION" ]]; then
    "$PG_BIN/pg_ctl" -D "$STATE/pgdata" -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ -f "$STATE/redis.pid" ]]; then
    redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
    rm -f "$STATE/redis.pid"
  fi
}

# --- database contents --------------------------------------------------------

calcom_sha() {
  [[ -d "$DIR/.git" ]] || die "$DIR is not a Cal.com checkout; run scripts/setup_calcom.sh first"
  git -C "$DIR" rev-parse HEAD
}

# Snapshots depend on the commit (its migrations and seed script) and on the
# backend (pg_restore must not be older than the pg_dump that wrote the file).
snapshot_path() { echo "$STATE/snapshots/$DB_NAME-$(calcom_sha | cut -c1-12)-$DB_BACKEND.dump"; }

recreate_db() {
  pg psql -d postgres -q -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" \
    -c "CREATE DATABASE $DB_NAME" >/dev/null
}

migrate_and_seed() {
  local snap="$1"
  [[ -d "$DIR/node_modules" ]] || die "$DIR has no node_modules; run scripts/setup_calcom.sh first"
  recreate_db
  eval "$(print_env)"
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  log "Applying migrations (prisma migrate deploy)"
  (cd "$DIR" && corepack yarn workspace @calcom/prisma db-deploy)
  log "Seeding test users and event types (several minutes)"
  (cd "$DIR" && corepack yarn workspace @calcom/prisma db-seed)
  log "Saving snapshot $(basename "$snap")"
  mkdir -p "$(dirname "$snap")"
  pg pg_dump -d "$DB_NAME" -Fc --no-owner > "$snap.tmp"
  mv "$snap.tmp" "$snap"
}

restore_snapshot() {
  local snap="$1"
  log "Restoring $(basename "$snap")"
  recreate_db
  pg pg_restore -d "$DB_NAME" --no-owner --exit-on-error < "$snap"
  if redis_ready; then
    if [[ "$DB_BACKEND" == docker ]]; then dc exec -T redis redis-cli flushall >/dev/null
    else redis-cli -p "$REDIS_PORT" flushall >/dev/null; fi
  fi
}

# --- commands -----------------------------------------------------------------

cmd="${1:-}"
[[ "$DB_BACKEND" == native && "$cmd" != env && -n "$cmd" ]] && find_pg_bin

case "$cmd" in
  up)
    start_services
    snap="$(snapshot_path)"
    if [[ -f "$snap" ]]; then
      restore_snapshot "$snap"
    else
      migrate_and_seed "$snap"
    fi
    log "Ready. Load the test environment with: eval \"\$(scripts/db.sh env)\""
    ;;
  reset)
    postgres_ready || die "Postgres isn't running; run scripts/db.sh up"
    snap="$(snapshot_path)"
    [[ -f "$snap" ]] || die "no snapshot for this Cal.com commit; run scripts/db.sh up"
    restore_snapshot "$snap"
    ;;
  down)
    stop_services
    log "Stopped"
    ;;
  nuke)
    stop_services
    if [[ "$DB_BACKEND" == docker ]]; then dc down --volumes; fi
    rm -rf "$STATE"
    log "Deleted database data and snapshots"
    ;;
  status)
    echo "backend:  $DB_BACKEND"
    if postgres_ready; then echo "postgres: up (port $DB_PORT)"; else echo "postgres: down"; fi
    if redis_ready; then echo "redis:    up (port $REDIS_PORT)"; else echo "redis:    down"; fi
    snap="$(snapshot_path 2>/dev/null || true)"
    if [[ -n "$snap" && -f "$snap" ]]; then echo "snapshot: $(basename "$snap")"
    else echo "snapshot: none for this Cal.com commit"; fi
    ;;
  env)
    print_env
    ;;
  *)
    sed -n '2,27p' "$0"
    [[ -z "$cmd" || "$cmd" == -h || "$cmd" == --help ]] || exit 1
    ;;
esac
