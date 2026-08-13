#!/usr/bin/env bash
#
# auto-deploy.sh — polls GitHub every run for new commits on `main`, and if
# found: hard-resets a DEDICATED deploy checkout to that commit, rebuilds,
# restarts, health-checks, and automatically rolls back to the last known
# good commit if anything fails.
#
# IMPORTANT: this script runs `git reset --hard`, which destroys any local
# uncommitted changes in DEPLOY_DIR. That is why DEPLOY_DIR must be a
# dedicated checkout used ONLY by this script — never a directory where you
# also do manual development (see README.md section 33/35 warnings about
# preserving uncommitted work; those warnings do NOT apply to DEPLOY_DIR
# precisely because nothing is ever hand-edited there).
#
# Intended to be run every minute by the systemd timer in this same
# directory (mkdd-auto-deploy.timer). Safe to run manually at any time.
#
set -uo pipefail

REPO_URL="${MKDD_REPO_URL:-https://github.com/menokemo/openhands-mkdd.git}"
DEPLOY_DIR="${MKDD_DEPLOY_DIR:-/opt/mkdd-live}"
LOCK_FILE="/tmp/mkdd-auto-deploy.lock"
LOG_FILE="${MKDD_DEPLOY_LOG:-/var/log/mkdd-auto-deploy.log}"
STATE_FILE="$DEPLOY_DIR/.last-good-commit"
HEALTH_RETRIES=30
HEALTH_INTERVAL=2

# ---------------------------------------------------------------------------
# Locking: prevent two runs overlapping (a build can take minutes, and the
# timer fires every minute).
# ---------------------------------------------------------------------------
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0 # another run is already in progress; this is not an error
fi

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

# ---------------------------------------------------------------------------
# 0. Git safety: mark DEPLOY_DIR as a safe.directory for whichever user runs
# this script. Git refuses to operate on a repo whose owner doesn't match
# the current user ("detected dubious ownership") — this commonly bites
# systemd-run services, where $HOME may not point at the same place a
# manual `sudo git config --global` edit was made. Doing this here, every
# run, makes the script self-contained: it never depends on a one-off
# manual setup step succeeding on whatever machine/user context it happens
# to run under.
# ---------------------------------------------------------------------------
if ! git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$DEPLOY_DIR"; then
  git config --global --add safe.directory "$DEPLOY_DIR"
fi

# ---------------------------------------------------------------------------
# 1. Ensure the dedicated deploy checkout exists
# ---------------------------------------------------------------------------
if [ ! -d "$DEPLOY_DIR/.git" ]; then
  log "No deploy checkout found at $DEPLOY_DIR — cloning fresh."
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  git clone "$REPO_URL" "$DEPLOY_DIR" >>"$LOG_FILE" 2>&1
  # Don't assume the clone landed on `main` (depends on the remote's
  # default-branch setting). Force the local branch to explicitly track
  # origin/main so every later `git rev-parse HEAD` compares the right ref.
  git -C "$DEPLOY_DIR" checkout -B main origin/main >>"$LOG_FILE" 2>&1
fi

cd "$DEPLOY_DIR"

# If an isolated .env exists here (staging ports/names/image/volume — see
# deploy/.env.staging), source it so our own health check below hits the
# correct port. `docker compose` also picks this file up automatically for
# every build/up call, with no extra flags needed.
if [ -f "$DEPLOY_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DEPLOY_DIR/.env"
  set +a
fi

HEALTH_URL="http://localhost:${MKDD_UI_BACKEND_PORT:-8787}/api/health"

# ---------------------------------------------------------------------------
# 2. Check for new commits
# ---------------------------------------------------------------------------
git fetch origin main >>"$LOG_FILE" 2>&1

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse origin/main)"

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  exit 0 # already up to date, nothing to do
fi

log "New commit detected: $LOCAL_HEAD -> $REMOTE_HEAD"

# Record the current commit as "last known good" before switching, but only
# if we don't already have one recorded (first-ever run).
if [ ! -f "$STATE_FILE" ]; then
  echo "$LOCAL_HEAD" >"$STATE_FILE"
fi

# ---------------------------------------------------------------------------
# 3. Roll forward
# ---------------------------------------------------------------------------
git reset --hard "$REMOTE_HEAD" >>"$LOG_FILE" 2>&1

deploy_and_check() {
  local target_commit="$1"

  log "Building and starting stack at $target_commit..."
  if ! ./setup.sh up >>"$LOG_FILE" 2>&1; then
    log "setup.sh FAILED at $target_commit"
    return 1
  fi

  log "Waiting for health check ($HEALTH_URL)..."
  for _ in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      log "Health check passed."
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done

  log "Health check FAILED after $((HEALTH_RETRIES * HEALTH_INTERVAL))s at $target_commit"
  return 1
}

if deploy_and_check "$REMOTE_HEAD"; then
  echo "$REMOTE_HEAD" >"$STATE_FILE"
  log "Deploy succeeded: now running $REMOTE_HEAD"
  exit 0
fi

# ---------------------------------------------------------------------------
# 4. Automatic rollback
# ---------------------------------------------------------------------------
LAST_GOOD="$(cat "$STATE_FILE")"
log "Rolling back to last known good commit: $LAST_GOOD"
git reset --hard "$LAST_GOOD" >>"$LOG_FILE" 2>&1

if deploy_and_check "$LAST_GOOD"; then
  log "Rollback succeeded: running last known good ($LAST_GOOD) again."
  exit 1 # the *new* commit still failed; report non-zero even though we recovered
else
  log "CRITICAL: rollback to last known good ALSO failed. Manual intervention required at $DEPLOY_DIR."
  exit 2
fi
