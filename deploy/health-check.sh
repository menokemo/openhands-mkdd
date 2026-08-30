#!/usr/bin/env bash
#
# health-check.sh — runs a comprehensive set of checks against the live MKDD
# stack, covering every real failure mode discovered live throughout the
# project's development sessions (see BUGS_AND_FIXES.md #157 for the full
# story behind each check). Prints a clear pass/fail report, writes a
# structured JSON status file MKDD's own UI can display, and exits non-zero
# if anything failed.
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

# BUGS_AND_FIXES.md #168: load values from the real .env file, the same
# one docker compose itself reads (deploy/README.md's optional
# MKDD_HEALTH_CHECK_* activation step assumes this happens automatically
# - it didn't, since nothing here or in mkdd-health-check.service ever
# actually sourced it, only commented-out examples that looked like
# activation but weren't). `set -a` auto-exports every KEY=VALUE line so
# they're visible to the rest of this script exactly like real
# environment variables, without overwriting anything already exported
# by the caller (e.g. a manual override on the command line still wins,
# since bash's own variable-already-set behavior isn't touched here -
# .env values simply fill in whatever wasn't already set).
if [ -f "$DEPLOY_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DEPLOY_DIR/.env"
  set +a
fi

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
INTERNAL_KEY_FILE="${MKDD_PROJECTS_DIR:-$DEPLOY_DIR/projects}/.mkdd-internal/service-key.txt"
# Where the JSON status file is written, for MKDD's own UI to read via
# GET /api/system-health (BUGS_AND_FIXES.md #158). Defaults to the same
# shared mkdd-data volume both containers already mount.
STATUS_FILE="${MKDD_HEALTH_STATUS_FILE:-$DEPLOY_DIR/mkdd-data/health-status.json}"
# BUGS_AND_FIXES.md #159: bounded JSONL log of check TRANSITIONS
# (healthy->failing or failing->healthy), not every check on every run.
HISTORY_FILE="${MKDD_HEALTH_HISTORY_FILE:-$DEPLOY_DIR/mkdd-data/health-history.jsonl}"

FAILURES=()
PASS_COUNT=0
# Structured results as NAME<TAB>OK<TAB>MESSAGE lines (tab-separated,
# not comma/UTF-8-delimiter-separated - directly avoiding a repeat of
# the Arabic-comma-as-paste-delimiter corruption bug found earlier in
# this same script). Built into JSON via python3 at the end, never by
# hand-assembling a JSON string in bash.
RESULTS=()

# ---------------------------------------------------------------------------
record() {
  # record <name> <ok:true|false|null> <message>
  RESULTS+=("$1"$'\t'"$2"$'\t'"$3")
}

log_pass() {
  # log_pass <check_id> <message>
  echo "  ✅ $2"
  PASS_COUNT=$((PASS_COUNT + 1))
  record "$1" "true" "$2"
}

log_fail() {
  # log_fail <check_id> <message>
  echo "  ❌ $2"
  FAILURES+=("$2")
  record "$1" "false" "$2"
}

log_skip() {
  # log_skip <check_id> <message>
  echo "  ⏭️  $2"
  record "$1" "null" "$2"
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
      log_pass "container_$container" "Container $container is running"
    else
      log_fail "container_$container" "Container $container is NOT running (status: ${status:-not found})"
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
    log_pass "mkdd_health" "MKDD backend /api/health responds"
  else
    log_fail "mkdd_health" "MKDD backend /api/health did NOT respond within 10s"
  fi
}

# ---------------------------------------------------------------------------
# Check 3: OpenHands agent-server's own /ready responds.
# ---------------------------------------------------------------------------
check_agent_canvas_ready() {
  if curl -fsS -m 10 "http://localhost:${AGENT_CANVAS_PORT}/ready" >/dev/null 2>&1; then
    log_pass "agent_canvas_ready" "Agent Canvas /ready responds"
  else
    log_fail "agent_canvas_ready" "Agent Canvas /ready did NOT respond within 10s"
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
    log_pass "git_ownership" "Git safe.directory exception is present in agent-canvas"
  else
    log_fail "git_ownership" "Git safe.directory exception is MISSING in agent-canvas (new conversations will fail with 'dubious ownership')"
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
  # BUGS_AND_FIXES.md #161: NextElapseUSecRealtime only applies to
  # OnCalendar= timers - mkdd-auto-deploy.timer uses OnBootSec/
  # OnUnitActiveSec (relative scheduling), whose real next-run property
  # is NextElapseUSecMonotonic instead. Checking both covers either
  # kind of timer correctly.
  next_realtime=$(systemctl show "$AUTO_DEPLOY_TIMER" -p NextElapseUSecRealtime --value 2>/dev/null)
  next_monotonic=$(systemctl show "$AUTO_DEPLOY_TIMER" -p NextElapseUSecMonotonic --value 2>/dev/null)
  if { [ -n "$next_realtime" ] && [ "$next_realtime" != "0" ]; } || \
     { [ -n "$next_monotonic" ] && [ "$next_monotonic" != "0" ]; }; then
    log_pass "auto_deploy_timer" "$AUTO_DEPLOY_TIMER has a real scheduled next run"
  else
    log_fail "auto_deploy_timer" "$AUTO_DEPLOY_TIMER has NO scheduled next run (needs: systemctl start ${AUTO_DEPLOY_TIMER%.timer}.service to re-anchor)"
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
    log_skip "deep_lookup" "Deep conversation lookup skipped (MKDD_HEALTH_CHECK_PROJECT/EMPLOYEE_ID/EMPLOYEE_NAME not set)"
    return
  fi
  if [ ! -f "$INTERNAL_KEY_FILE" ]; then
    log_skip "deep_lookup" "Deep conversation lookup skipped (internal service key not found yet at $INTERNAL_KEY_FILE)"
    return
  fi
  service_key=$(cat "$INTERNAL_KEY_FILE")
  qs="project=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$HEALTH_CHECK_PROJECT")"
  qs="${qs}&employeeId=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$HEALTH_CHECK_EMPLOYEE_ID")"
  qs="${qs}&employeeName=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$HEALTH_CHECK_EMPLOYEE_NAME")"

  response=$(curl -fsS -m 12 -H "X-Internal-Service-Key: $service_key" \
    "http://localhost:${MKDD_UI_PORT}/api/internal/health-deep?${qs}" 2>/dev/null)

  # BUGS_AND_FIXES.md #170: prefer the clear, human-readable Arabic
  # explanation (which includes real parsed details like time-until-
  # reset and plan type, when the provider's error payload includes
  # them) over the bare code/kind summary.
  error_summary=$(echo "$response" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)
err = data.get("recentError")
if err:
    human = err.get("humanMessage")
    if human:
        print(human)
    else:
        code = err.get("code", "unknown")
        kind = (err.get("classification") or {}).get("kind", "unknown")
        print(f"{code} ({kind})")
' 2>/dev/null)

  if echo "$response" | grep -q '"ok":true'; then
    log_pass "deep_lookup" "Deep conversation lookup succeeded ($response)"
  elif [ -n "$error_summary" ]; then
    log_fail "deep_lookup" "Recent conversation error detected: $error_summary"
  else
    log_fail "deep_lookup" "Deep conversation lookup FAILED (response: ${response:-no response within 12s})"
  fi
}

# ---------------------------------------------------------------------------
# Check 7: every subscription-based LLM profile currently registered is
# actually connected and not expired/expiring soon.
# (BUGS_AND_FIXES.md #162: this is the exact failure mode behind
# litellm.BadRequestError-style incidents seen earlier this session -
# an employee's conversation mysteriously stopping because the
# subscription backing their model disconnected or its expires_at
# passed. Deliberately generic: no vendor or model name is hardcoded
# anywhere - it discovers whatever profiles are actually registered and
# only checks the ones that are genuinely subscription-based, so it
# keeps working correctly if the model/vendor changes in the future.)
# ---------------------------------------------------------------------------
check_llm_health() {
  if [ ! -f "$INTERNAL_KEY_FILE" ]; then
    log_skip "llm_health" "LLM subscription check skipped (internal service key not found yet at $INTERNAL_KEY_FILE)"
    return
  fi
  service_key=$(cat "$INTERNAL_KEY_FILE")
  response=$(curl -fsS -m 12 -H "X-Internal-Service-Key: $service_key" \
    "http://localhost:${MKDD_UI_PORT}/api/internal/llm-health" 2>/dev/null)

  if [ -z "$response" ]; then
    log_fail "llm_health" "LLM subscription check FAILED (no response within 12s)"
    return
  fi

  # Summarize per-profile results into readable pass/fail lines via
  # python3 (never hand-parsed with grep/sed - directly avoiding the
  # kind of fragile string-matching mistakes found elsewhere in this
  # script during earlier live testing). Uses a STABLE check_id (the
  # profile name alone) separate from the variable descriptive message
  # - directly avoiding a repeat of #159's bug, where using the full
  # (variable) message as the identity broke transition tracking.
  summary=$(echo "$response" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    print("PARSE_ERROR")
    sys.exit(0)
for p in data.get("profiles", []):
    if not p.get("checked"):
        continue
    name = p.get("name", "?")
    vendor = p.get("vendor", "?")
    status = "OK" if p.get("ok") else "FAIL"
    reason = p.get("reason", "")
    hours = p.get("hoursRemaining")
    extra = " (" + str(hours) + "h remaining)" if hours is not None else ""
    message = name + " (" + vendor + "): " + reason + extra
    print(status + "\t" + name + "\t" + message)
' 2>/dev/null)

  if [ -z "$summary" ]; then
    log_pass "llm_health" "No subscription-based LLM profiles to check"
    return
  fi

  while IFS=$'\t' read -r result profile_name message; do
    [ -z "$result" ] && continue
    if [ "$result" = "OK" ]; then
      log_pass "llm_profile_$profile_name" "LLM profile healthy: $message"
    else
      log_fail "llm_profile_$profile_name" "LLM profile issue: $message"
    fi
  done <<< "$summary"
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
check_llm_health
echo "---------------------------------------------------------------------"

# ---------------------------------------------------------------------------
# Write the structured JSON status file (BUGS_AND_FIXES.md #158) - read by
# MKDD's own GET /api/system-health, and displayed in a new sidebar screen
# so the owner can see live system health inside the app itself, not only
# via a push notification when something breaks. Built entirely through
# python3's json.dumps (never a hand-assembled JSON string), which safely
# handles the Arabic text in check messages - directly avoiding a repeat
# of this same script's earlier UTF-8 delimiter corruption bug.
#
# Also detects TRANSITIONS against the previous run (BUGS_AND_FIXES.md
# #159) - a check going from healthy to failing, or failing to healthy
# again - and appends them to a bounded history log. Logging every check
# on every 5-minute run would be excessive and mostly redundant "still
# healthy" noise; transitions are the actually useful incident signal
# for a history view.
# ---------------------------------------------------------------------------
write_status_file() {
  mkdir -p "$(dirname "$STATUS_FILE")" 2>/dev/null || true
  mkdir -p "$(dirname "$HISTORY_FILE")" 2>/dev/null || true
  printf '%s\n' "${RESULTS[@]}" | python3 -c '
import json, sys, datetime

status_file = sys.argv[1]
history_file = sys.argv[2]
max_history_entries = 500

checks = []
for line in sys.stdin:
    line = line.rstrip("\n")
    if not line:
        continue
    parts = line.split("\t", 2)
    if len(parts) != 3:
        continue
    name, ok_raw, message = parts
    ok = {"true": True, "false": False, "null": None}.get(ok_raw)
    checks.append({"name": name, "ok": ok, "message": message})

overall_ok = all(c["ok"] is not False for c in checks)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()

# Read the PREVIOUS status (before overwriting it) to detect transitions.
previous_by_name = {}
try:
    with open(status_file, "r", encoding="utf-8") as f:
        previous = json.load(f)
    for c in previous.get("checks", []):
        previous_by_name[c["name"]] = c.get("ok")
except (OSError, json.JSONDecodeError):
    pass  # no previous status yet (first run) - nothing to compare against

new_history_entries = []
for c in checks:
    old_ok = previous_by_name.get(c["name"])
    new_ok = c["ok"]
    # Only log true<->false transitions - a check appearing/disappearing
    # (e.g. the optional deep-lookup check being configured or not) or a
    # skip state is not itself an incident.
    if old_ok is None or new_ok is None or old_ok == new_ok:
        continue
    new_history_entries.append({
        "at": now,
        "name": c["name"],
        "transition": "recovered" if new_ok else "became_unhealthy",
        "message": c["message"],
    })

status = {"checkedAt": now, "ok": overall_ok, "checks": checks}

try:
    with open(status_file, "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)
except OSError as e:
    print(f"Failed to write status file: {e}", file=sys.stderr)

if new_history_entries:
    existing_lines = []
    try:
        with open(history_file, "r", encoding="utf-8") as f:
            existing_lines = [line.rstrip("\n") for line in f if line.strip()]
    except OSError:
        pass
    new_lines = [json.dumps(e, ensure_ascii=False) for e in new_history_entries]
    combined = (existing_lines + new_lines)[-max_history_entries:]
    try:
        with open(history_file, "w", encoding="utf-8") as f:
            f.write("\n".join(combined) + "\n")
    except OSError as e:
        print(f"Failed to write history file: {e}", file=sys.stderr)
' "$STATUS_FILE" "$HISTORY_FILE" 2>&1 || echo "Warning: failed to write status/history files" >&2
}

write_status_file

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
