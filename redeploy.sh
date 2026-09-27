#!/usr/bin/env bash
# redeploy.sh — rebuild and restart the app with the latest local code.
#
# What it does:
#   1. Installs dependencies (pnpm install)
#   2. Applies DB schema changes (drizzle-kit push, e.g. new tables)
#   3. Rebuilds the API server (esbuild) and the frontend (vite)
#   4. Restarts the API server and the frontend preview server,
#      freeing ports 8080/3000 first if something else is using them
#
# Configuration (in priority order):
#   - environment variables
#   - .env file in the repo root (gitignored)
#   - import.sh fallbacks (DATABASE_URL, PORT=8080)
#
# Useful flags:
#   --build-only   build without restarting services
#   --no-db        skip the database schema push
#
# Logs are written to ./logs/

set -euo pipefail
cd "$(dirname "$0")"

BUILD_ONLY=0
PUSH_DB=1
for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    --no-db) PUSH_DB=0 ;;
    -h|--help) grep '^#' "$0" | head -20; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- Load configuration -------------------------------------------------------
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
if [ -z "${DATABASE_URL:-}" ] && [ -f import.sh ]; then
  # Reuse the DATABASE_URL recorded in import.sh without executing the whole file.
  eval "$(grep -m1 '^export DATABASE_URL=' import.sh)"
fi

: "${DATABASE_URL:?DATABASE_URL is required — put it in .env or export it}"

API_PORT="${PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BASE_PATH="${BASE_PATH:-/}"
LOG_DIR="$PWD/logs"
mkdir -p "$LOG_DIR"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# Stop whatever currently listens on a TCP port (returns 0 if the port is free).
free_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Port $port is in use — stopping: $(echo "$pids" | tr '\n' ' ')"
    kill $pids 2>/dev/null || true
    for _ in $(seq 1 20); do
      lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1 || return 0
      sleep 0.5
    done
    kill -9 $pids 2>/dev/null || true
  fi
}

# Wait until an HTTP endpoint responds, or fail after ~30s.
wait_for_http() {
  local url="$1" what="$2"
  for _ in $(seq 1 30); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "$what is up at $url"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: $what did not start — check the log." >&2
  return 1
}

# --- 1. Dependencies ----------------------------------------------------------
step "Installing dependencies"
pnpm install

# --- 2. Database schema -------------------------------------------------------
if [ "$PUSH_DB" -eq 1 ]; then
  step "Applying database schema (drizzle-kit push)"
  pnpm --filter @workspace/db run push
else
  step "Skipping database schema push (--no-db)"
fi

# --- 3. Build -----------------------------------------------------------------
step "Building API server and frontend"
PORT="$FRONTEND_PORT" BASE_PATH="$BASE_PATH" \
  pnpm --filter @workspace/api-server --filter @workspace/grocery-tracker -r run build

if [ "$BUILD_ONLY" -eq 1 ]; then
  step "Build finished (--build-only, not restarting services)"
  exit 0
fi

# --- 4. Restart services ------------------------------------------------------
step "Restarting services"
free_port "$API_PORT"
free_port "$FRONTEND_PORT"

step "Starting API server on port $API_PORT"
NODE_ENV=production PORT="$API_PORT" DATABASE_URL="$DATABASE_URL" \
  nohup node artifacts/api-server/dist/index.cjs > "$LOG_DIR/api-server.log" 2>&1 &
echo $! > "$LOG_DIR/api-server.pid"
wait_for_http "http://localhost:$API_PORT/api/healthz" "API server"

step "Starting frontend preview on port $FRONTEND_PORT"
(
  cd artifacts/grocery-tracker
  NODE_ENV=production PORT="$FRONTEND_PORT" BASE_PATH="$BASE_PATH" \
    nohup ./node_modules/.bin/vite preview --config vite.config.ts --host 0.0.0.0 \
    > "$LOG_DIR/frontend.log" 2>&1 &
  echo $! > "$LOG_DIR/frontend.pid"
)
wait_for_http "http://localhost:$FRONTEND_PORT/" "Frontend"

step "Redeploy finished"
echo "  Frontend:  http://localhost:$FRONTEND_PORT/"
echo "  API:       http://localhost:$API_PORT/api/healthz"
echo "  Logs:      $LOG_DIR/"
