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
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:8787/api/health" >/dev/null 2>&1; then
    echo "    MKDD backend is up."
    break
  fi
  sleep 2
done

cat <<'EOF'

==> MKDD is starting.

    MKDD UI:        http://localhost:5173
    Agent Canvas:   http://localhost:3000
    Agent Server:   http://localhost:8000

Run './setup.sh status' to check container health, or
    './setup.sh logs'   to follow logs.

EOF
