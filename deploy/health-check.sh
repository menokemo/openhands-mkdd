#!/usr/bin/env bash
#
# health-check.sh — runs a comprehensive set of checks against the live MKDD
# stack, covering every real failure mode discovered live throughout the
# project's development sessions (see BUGS_AND_FIXES.md #157 for the full
# story behind each check). Prints a clear pass/fail report and exits
# non-zero if anything failed.
#
# Two intended uses:
# 1. Manual smoke-testing: run this by hand right after any OpenHands
#    upgrade or major deploy, before trusting it, e.g.:
#      ./health-check.sh
# 2. Automated monitoring: mkdd-health-check.timer runs this every few
#    minutes; on any failure it also pushes a real-time notification to
#    the owner via /api/internal/alert, so problems are caught the moment
#    they happen instead of only when the owner stumbles into them.
#
# Safe to run repeatedly and frequently: every check here is either a
# read-only lookup or a status inspection - nothing here creates real
# conversations, writes files, or accumulates state over time (see #145's
# lesson about frequent automated actions needing to stay cheap).
#
set -uo pipefail

DEPLOY_DIR="${MKDD_DEPLOY_DIR:-/opt/mkdd-live}"
MKDD_UI_CONTAINER="${MKDD_UI_CONTAINER_NAME:-mkdd-ui-staging}"
AGENT_CANVAS_CONTAINER="${MKDD_AGENT_CANVAS_CONTAINER_NAME:-openhands-agent-canvas-staging}"
MKDD_UI_PORT="${MKDD_UI_BACKEND_PORT:-18787}"
AGENT_CANVAS_PORT="${MKDD_AGENT_CANVAS_PORT:-18000}"
AUTO_DEPLOY_TIMER="${MKDD_AUTO_DEPLOY_TIMER:-mkdd-auto-deploy.timer}"
# Optional: a real project/employee to exercise the deep conversation-
# lookup check against (see #157's handle-internal-health-deep). If
# unset, that one check is skipped rather than failing - every
# deployment has different project/employee names, and this script
# must work reasonably even without this configured.
HEALTH_CHECK_PROJECT="${MKDD_HEALTH_CHECK_PROJECT:-}"
HEALTH_CHECK_EMPLOYEE_ID="${MKDD_HEALTH_CHECK_EMPLOYEE_ID:-}"
HEALTH_CHECK_EMPLOYEE_NAME="${MKDD_HEALTH_CHECK_EMPLOYEE_NAME:-}"
INTERNAL_KEY_FILE="${MKDD_PROJECTS_DIR:-/opt/openhands/projects}/.mkdd-internal/service-key.txt"

FAILURES=()
PASS_COUNT=0

# ---------------------------------------------------------------------------
log_pass() {
  echo "  ✅ $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

log_fail() {
  echo "  ❌ $1"
  FAILURES+=("$1")
}

# ---------------------------------------------------------------------------
# Check 1: both containers are actually "Up", not exited/restarting.
# (BUGS_AND_FIXES.md: mkdd-ui-staging repeatedly exited with code 137
# during heavy build load this session - a plain container-status check
# would have surfaced this the moment it happened, instead of only when
# the owner tried to log in and got a generic error.)
# ---------------------------------------------------------------------------
check_containers() {
  for container in "$MKDD_UI_CONTAINER" "$AGENT_CANVAS_CONTAINER"; do
    status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null)
    if [ "$status" = "running" ]; then
      log_pass "Container $container is running"
    else
      log_fail "Container $container is NOT running (status: ${status:-not found})"
    fi
  done
}

# ---------------------------------------------------------------------------
# Check 2: MKDD's own /api/health responds, without auth.
# (BUGS_AND_FIXES.md #142: this same endpoint being unreachable trapped
# auto-deploy in a silent infinite rollback loop for days.)
# ---------------------------------------------------------------------------
check_mkdd_health() {
  if curl -fsS -m 10 "http://localhost:${MKDD_UI_PORT}/api/health" >/dev/null 2>&1; then
    log_pass "MKDD backend /api/health responds"
  else
    log_fail "MKDD backend /api/health did NOT respond within 10s"
  fi
}

# ---------------------------------------------------------------------------
# Check 3: OpenHands agent-server's own /ready responds.
# ---------------------------------------------------------------------------
check_agent_canvas_ready() {
  if curl -fsS -m 10 "http://localhost:${AGENT_CANVAS_PORT}/ready" >/dev/null 2>&1; then
    log_pass "Agent Canvas /ready responds"
  else
    log_fail "Agent Canvas /ready did NOT respond within 10s"
  fi
}

# ---------------------------------------------------------------------------
# Check 4: git repos under /projects are actually usable (not blocked by
# Git's "dubious ownership" safety check).
# (BUGS_AND_FIXES.md #152: this exact failure silently broke every new
# conversation - "the employee stops mid-task" - until diagnosed live.
# The permanent Dockerfile fix should prevent this going forward, but
# this check catches it immediately if it ever recurs, e.g. after a
# manual volume operation on the host.)
# ---------------------------------------------------------------------------
check_git_ownership() {
  output=$(docker exec "$AGENT_CANVAS_CONTAINER" bash -c \
    "for d in /projects/*/; do [ -d \"\$d/.git\" ] && git -C \"\$d\" status >/dev/null 2>&1 || true; done; \
     git config --global --get-all safe.directory 2>/dev/null | grep -qx '\*' && echo OK || echo MISSING" \
    2>/dev/null)
  if [ "$output" = "OK" ]; then
    log_pass "Git safe.directory exception is present in agent-canvas"
  else
    log_fail "Git safe.directory exception is MISSING in agent-canvas (new conversations will fail with 'dubious ownership')"
  fi
}

# ---------------------------------------------------------------------------
# Check 5: mkdd-auto-deploy.timer actually has a real next-run time
# scheduled, not stuck at "n/a".
# (BUGS_AND_FIXES.md #142/#143: this silently stopped auto-deploy from
# ever running again after a manual restart, twice in one session, each
# time needing a one-off `systemctl start` on the .service itself to
# re-anchor OnUnitActiveSec.)
# ---------------------------------------------------------------------------
check_auto_deploy_timer() {
  next=$(systemctl show "$AUTO_DEPLOY_TIMER" -p NextElapseUSecRealtime --value 2>/dev/null)
  if [ -n "$next" ] && [ "$next" != "0" ]; then
    log_pass "$AUTO_DEPLOY_TIMER has a real scheduled next run"
  else
    log_fail "$AUTO_DEPLOY_TIMER has NO scheduled next run (needs: systemctl start ${AUTO_DEPLOY_TIMER%.timer}.service to re-anchor)"
  fi
}

# ---------------------------------------------------------------------------
# Check 6 (optional, only if configured): a real end-to-end conversation
# lookup via /api/internal/health-deep.
# (BUGS_AND_FIXES.md #157: this is the one check that would have caught
# this session's actual stuck-loading incident automatically - the
# OpenHands events WebSocket connecting successfully but never sending
# data. Deliberately a lookup, never a conversation create, so running
# this frequently never accumulates real conversations - see #145.)
# ---------------------------------------------------------------------------
check_deep_conversation_lookup() {
  if [ -z "$HEALTH_CHECK_PROJECT" ] || [ -z "$HEALTH_CHECK_EMPLOYEE_ID" ] || [ -z "$HEALTH_CHECK_EMPLOYEE_NAME" ]; then
    echo "  ⏭️  Deep conversation lookup skipped (MKDD_HEALTH_CHECK_PROJECT/EMPLOYEE_ID/EMPLOYEE_NAME not set)"
    return
  fi
  if [ ! -f "$INTERNAL_KEY_FILE" ]; then
    echo "  ⏭️  Deep conversation lookup skipped (internal service key not found yet at $INTERNAL_KEY_FILE)"
    return
  fi
  service_key=$(cat "$INTERNAL_KEY_FILE")
  qs="project=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$HEALTH_CHECK_PROJECT")"
  qs="${qs}&employeeId=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$HEALTH_CHECK_EMPLOYEE_ID")"
  qs="${qs}&employeeName=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$HEALTH_CHECK_EMPLOYEE_NAME")"

  response=$(curl -fsS -m 12 -H "X-Internal-Service-Key: $service_key" \
    "http://localhost:${MKDD_UI_PORT}/api/internal/health-deep?${qs}" 2>/dev/null)
  if echo "$response" | grep -q '"ok":true'; then
    log_pass "Deep conversation lookup succeeded ($response)"
  else
    log_fail "Deep conversation lookup FAILED (response: ${response:-no response within 12s})"
  fi
}

# ---------------------------------------------------------------------------
echo "MKDD health check — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "---------------------------------------------------------------------"
check_containers
check_mkdd_health
check_agent_canvas_ready
check_git_ownership
check_auto_deploy_timer
check_deep_conversation_lookup
echo "---------------------------------------------------------------------"

if [ "${#FAILURES[@]}" -eq 0 ]; then
  echo "All checks passed ($PASS_COUNT/$PASS_COUNT)."
  exit 0
fi

echo "${#FAILURES[@]} check(s) FAILED:"
for f in "${FAILURES[@]}"; do
  echo "  - $f"
done

# Send a real-time alert (BUGS_AND_FIXES.md #157) if configured to. This
# is best-effort - a failed alert must never change this script's own
# exit code, since the failures already detected are what matters.
if [ -f "$INTERNAL_KEY_FILE" ]; then
  service_key=$(cat "$INTERNAL_KEY_FILE")
  message=""
  for f in "${FAILURES[@]}"; do
    if [ -n "$message" ]; then
      message="${message}، ${f}"
    else
      message="$f"
    fi
  done
  curl -fsS -m 10 -X POST "http://localhost:${MKDD_UI_PORT}/api/internal/alert" \
    -H "content-type: application/json" \
    -H "X-Internal-Service-Key: $service_key" \
    -d "$(python3 -c "import json,sys; print(json.dumps({'title': 'فحص الصحة فشل', 'message': sys.argv[1], 'checkName': 'periodic'}))" "$message")" \
    >/dev/null 2>&1 || true
fi

exit 1
