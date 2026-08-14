#!/usr/bin/env bash
#
# setup.sh — one-command bootstrap for MKDD, from a fresh git clone to a
# running stack. This script exists because compose.yml alone was not
# reproducible on a clean machine (see BUGS_AND_FIXES.md #7/#8/#9 and
# PROJECT_AUDIT_REPORT.md section 2.2). It encodes every fix discovered
# during that investigation so a new VM never has to rediscover them.
#
# Usage:
#   ./setup.sh                 # build + start everything
#   ./setup.sh --no-build      # start without rebuilding images
#   ./setup.sh status          # show container status
#   ./setup.sh logs            # tail logs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# `docker compose` auto-loads a .env file from this directory for variable
# substitution inside compose.yml (e.g. port mappings). Source it here too,
# so this script's OWN bash-side logic (health-check port, printed URLs)
# agrees with whatever docker compose actually bound — otherwise an
# isolated instance (see deploy/.env.staging) would have its container
# correctly listening on e.g. 18787, while this script kept checking 8787.
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ---------------------------------------------------------------------------
# 1. Prerequisite checks
# ---------------------------------------------------------------------------
echo "==> Checking prerequisites..."

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not on PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: 'docker compose' (v2 plugin) is required." >&2
  exit 1
fi

echo "    docker: OK"
echo "    docker compose: OK"

# ---------------------------------------------------------------------------
# 2. Build-time configuration
#
# These defaults were confirmed working by an actual local build+run test
# on 2026-08-13 (see BUGS_AND_FIXES.md #7). They can be overridden by
# exporting the same variable names before running this script, or via a
# .env file next to compose.yml (docker compose reads .env automatically).
# ---------------------------------------------------------------------------
export AGENT_SERVER_IMAGE="${AGENT_SERVER_IMAGE:-ghcr.io/openhands/agent-server:1.40.1-python}"
export AUTOMATION_VERSION="${AUTOMATION_VERSION:-1.6.0}"
export MKDD_PROJECTS_DIR="${MKDD_PROJECTS_DIR:-./projects}"

echo "==> Build configuration:"
echo "    AGENT_SERVER_IMAGE = ${AGENT_SERVER_IMAGE}"
echo "    AUTOMATION_VERSION = ${AUTOMATION_VERSION}"
echo "    MKDD_PROJECTS_DIR  = ${MKDD_PROJECTS_DIR}"

# ---------------------------------------------------------------------------
# 3. Runtime directories that must exist before `docker compose up`
#    (bind mounts fail if the host path does not exist yet).
# ---------------------------------------------------------------------------
mkdir -p "${MKDD_PROJECTS_DIR}"
mkdir -p mkdd-data/branding

# ---------------------------------------------------------------------------
# 4. Build + start
# ---------------------------------------------------------------------------
ACTION="${1:-up}"

case "$ACTION" in
  status)
    docker compose ps
    exit 0
    ;;
  logs)
    docker compose logs -f --tail=150
    exit 0
    ;;
  --no-build)
    echo "==> Starting stack (no rebuild)..."
    docker compose up -d
    ;;
  up | "")
    echo "==> Building images (this can take several minutes the first time)..."
    docker compose build
    echo "==> Starting stack..."
    docker compose up -d
    ;;
  *)
    echo "Usage: $0 [up|--no-build|status|logs]" >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# 5. Wait for the backend to answer, then report where everything is
# ---------------------------------------------------------------------------
echo "==> Waiting for MKDD backend to become ready..."
MKDD_UI_BACKEND_PORT="${MKDD_UI_BACKEND_PORT:-8787}"
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:${MKDD_UI_BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    echo "    MKDD backend is up."
    break
  fi
  sleep 2
done

MKDD_UI_PORT="${MKDD_UI_PORT:-5173}"
MKDD_AGENT_CANVAS_UI_PORT="${MKDD_AGENT_CANVAS_UI_PORT:-3000}"
MKDD_AGENT_CANVAS_PORT="${MKDD_AGENT_CANVAS_PORT:-8000}"
MKDD_UI_CONTAINER_NAME="${MKDD_UI_CONTAINER_NAME:-mkdd-ui}"

# ---------------------------------------------------------------------------
# 6. Employee bootstrap (Agent Profiles for the 13 company employees)
#
# This is opt-in via MKDD_BOOTSTRAP_LLM_PROFILE_REF because it names an
# LLM profile that must already exist in Agent Canvas settings (Settings
# -> LLM Profiles) - setup.sh cannot invent one. If it's not set, employees
# are skipped with clear instructions instead of failing the whole setup.
# See server/scripts/bootstrap-employees.mjs and BUGS_AND_FIXES.md #20.
# ---------------------------------------------------------------------------
if [ -n "${MKDD_BOOTSTRAP_LLM_PROFILE_REF:-}" ]; then
  echo "==> Bootstrapping employees (LLM profile: ${MKDD_BOOTSTRAP_LLM_PROFILE_REF})..."
  docker exec \
    -e "MKDD_BOOTSTRAP_LLM_PROFILE_REF=${MKDD_BOOTSTRAP_LLM_PROFILE_REF}" \
    -e "MKDD_TIMEZONE=${MKDD_TIMEZONE:-Europe/Amsterdam}" \
    "${MKDD_UI_CONTAINER_NAME}" \
    node server/scripts/bootstrap-employees.mjs || {
      echo "WARNING: employee bootstrap failed - the stack is still up," >&2
      echo "         but employees were not created. Retry manually:" >&2
      echo "         docker exec -e MKDD_BOOTSTRAP_LLM_PROFILE_REF=<profile> \\" >&2
      echo "           ${MKDD_UI_CONTAINER_NAME} node server/scripts/bootstrap-employees.mjs" >&2
    }
else
  cat <<'EOF'
==> Skipping employee bootstrap: MKDD_BOOTSTRAP_LLM_PROFILE_REF is not set.

    Employees (the 13 Agent Profiles) need an LLM profile that already
    exists in Agent Canvas (Settings -> LLM Profiles). Once you have one,
    either re-run this script with the variable set:

      MKDD_BOOTSTRAP_LLM_PROFILE_REF=<your-llm-profile-name> ./setup.sh --no-build

    or run the bootstrap step directly:

      docker exec -e MKDD_BOOTSTRAP_LLM_PROFILE_REF=<your-llm-profile-name> \
        mkdd-ui node server/scripts/bootstrap-employees.mjs

EOF
fi

cat <<EOF

==> MKDD is starting.

    MKDD UI:        http://localhost:${MKDD_UI_PORT}
    Agent Canvas:   http://localhost:${MKDD_AGENT_CANVAS_UI_PORT}
    Agent Server:   http://localhost:${MKDD_AGENT_CANVAS_PORT}

Run './setup.sh status' to check container health, or
    './setup.sh logs'   to follow logs.

EOF
