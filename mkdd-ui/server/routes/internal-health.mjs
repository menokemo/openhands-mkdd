import fs from "node:fs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import { sendPushToAll } from "../lib/push-notifications.mjs";
import { findAuthorizedConversation } from "../lib/authorize-conversation.mjs";
import { openhands } from "../lib/openhands-client.mjs";

const HEALTH_STATUS_FILE =
  process.env.MKDD_HEALTH_STATUS_FILE ?? "/mkdd-data/health-status.json";

/**
 * POST /api/internal/alert — lets the health-check system (a
 * host-level bash script, deploy/health-check.sh, running outside
 * Node.js so it can inspect Docker container status and systemd timer
 * schedules) push a real-time notification to the owner the moment a
 * check fails (BUGS_AND_FIXES.md #157) — instead of the owner only
 * discovering something is broken by hitting it themselves, which is
 * exactly how every incident earlier in this session was found.
 *
 * Authorized the same way as /api/workflow/* (#134's internal-service-
 * key mechanism) - see server/index.mjs's isRequestAuthorized. Never
 * exposed to the browser; only ever called from the trusted VM host
 * itself, which is the one place able to run docker/systemctl checks.
 */
export async function handleInternalAlert(req, res) {
  if (!(req.method === "POST" && req.url === "/api/internal/alert")) return false;

  const { title, message, checkName } = await readJsonBody(req);

  if (!message?.trim()) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_request" }));
    return true;
  }

  // Fire-and-forget, matching #154's report-delivery pattern - the
  // caller (a bash script polling on a timer) should never be made to
  // wait on push delivery, and a push failure must never surface as an
  // error to a health-check script that already has a real problem to
  // report.
  sendPushToAll({
    title: title?.trim() || "تنبيه صحة النظام",
    body: message.trim(),
    url: "/",
    tag: checkName ? `mkdd-health-${checkName}` : "mkdd-health",
  }).catch((error) => {
    console.error("Failed to send health-check alert push:", error);
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
  return true;
}

/**
 * GET /api/internal/health-deep?project=...&employeeId=...&employeeName=...
 * — a real end-to-end check that the OpenHands agent-server is actually
 * responsive and correctly resolving a real employee's conversation
 * (BUGS_AND_FIXES.md #157). This is the single check in this whole
 * project that would have caught this session's stuck-loading and
 * session-key-failure incidents automatically, before the owner ever
 * saw them.
 *
 * Deliberately a LOOKUP only (findAuthorizedConversation), never a
 * conversation CREATE - #145 already proved that any frequent automated
 * action against the live conversation list must stay cheap and
 * read-only. A periodic "create a conversation" check would itself
 * accumulate real conversations over time and eventually recreate the
 * exact performance problem #145 fixed.
 */
export async function handleInternalHealthDeep(req, res) {
  if (!(req.method === "GET" && req.url?.startsWith("/api/internal/health-deep"))) {
    return false;
  }

  const url = new URL(req.url, "http://mkdd.local");
  const project = url.searchParams.get("project");
  const employeeId = url.searchParams.get("employeeId");
  const employeeName = url.searchParams.get("employeeName");

  if (!project || !employeeId || !employeeName) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_employee_required" }));
    return true;
  }

  const start = Date.now();
  const TIMEOUT_MS = 10_000;

  try {
    await Promise.race([
      findAuthorizedConversation({ project, employeeId, employeeName }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("health_check_timeout")), TIMEOUT_MS),
      ),
    ]);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, elapsedMs: Date.now() - start }));
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        elapsedMs: Date.now() - start,
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
  return true;
}

/**
 * GET /api/system-health — reads the JSON status file deploy/health-
 * check.sh writes after every run (BUGS_AND_FIXES.md #158), for a new
 * sidebar screen showing live system health inside MKDD's own UI -
 * not just a push notification when something breaks, but a real
 * place to look and see the current state.
 *
 * Uses normal owner-session authentication (not the internal service
 * key) - this is called directly from the browser, unlike the other
 * two endpoints in this file which are only ever called from the
 * trusted VM host's own script.
 */
export async function handleSystemHealth(req, res) {
  if (!(req.method === "GET" && req.url === "/api/system-health")) return false;

  try {
    const raw = fs.readFileSync(HEALTH_STATUS_FILE, "utf-8");
    const status = JSON.parse(raw);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(status));
  } catch {
    // No status file yet (health-check.sh hasn't run at all, e.g.
    // right after a fresh install before the timer's first tick) -
    // report this explicitly rather than as a generic server error,
    // so the frontend can show a clear "not checked yet" state.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ checkedAt: null, ok: null, checks: [] }));
  }
  return true;
}

const HEALTH_HISTORY_FILE =
  process.env.MKDD_HEALTH_HISTORY_FILE ?? "/mkdd-data/health-history.jsonl";

/**
 * GET /api/system-health-history — reads the bounded JSONL log of
 * check TRANSITIONS (healthy->failing or failing->healthy) that
 * deploy/health-check.sh appends to (BUGS_AND_FIXES.md #159), for the
 * "History" tab on the System Health screen. Deliberately transitions
 * only, not every check on every 5-minute run - the owner asked for
 * both a live status view AND a history of actual incidents, and a
 * log of "still healthy" entries every 5 minutes would bury the
 * useful signal.
 *
 * Same normal owner-session authentication as /api/system-health -
 * called directly from the browser.
 */
export async function handleSystemHealthHistory(req, res) {
  if (!(req.method === "GET" && req.url === "/api/system-health-history")) {
    return false;
  }

  try {
    const raw = fs.readFileSync(HEALTH_HISTORY_FILE, "utf-8");
    const events = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // most recent first, matching every other list in this app

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ events }));
  } catch {
    // No history file yet - no transitions have happened since the
    // monitoring system was set up, which is a genuinely good state,
    // not an error.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ events: [] }));
  }
  return true;
}

/**
 * GET /api/internal/llm-health — checks whether every LLM profile
 * currently in use is actually usable (BUGS_AND_FIXES.md #162),
 * specifically the failure mode that showed up earlier this session
 * as conversations mysteriously stopping mid-task with a
 * litellm.BadRequestError-style error: a subscription-based auth
 * (e.g. OpenAI Codex, "auth_type": "subscription") disconnecting or
 * its expires_at passing.
 *
 * Deliberately generic - no vendor or model name is hardcoded
 * anywhere. It discovers every registered profile via /api/profiles,
 * reads each one's actual auth_type/subscription_vendor from
 * /api/profiles/{name}, and only checks subscription status for
 * profiles that are genuinely subscription-based - this way it keeps
 * working correctly if the model/vendor changes in the future without
 * any code change needed.
 */
export async function handleInternalLlmHealth(req, res) {
  if (!(req.method === "GET" && req.url === "/api/internal/llm-health")) {
    return false;
  }

  const TIMEOUT_MS = 10_000;
  const EXPIRY_WARNING_HOURS = 24;

  try {
    const results = await Promise.race([
      checkAllLlmProfiles(EXPIRY_WARNING_HOURS),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("llm_health_timeout")), TIMEOUT_MS),
      ),
    ]);

    const ok = results.every((r) => r.ok !== false);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, profiles: results }));
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        profiles: [],
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
  return true;
}

async function checkAllLlmProfiles(expiryWarningHours) {
  const listRes = await openhands("/api/profiles");
  const { profiles: profileNames } = await listRes.json();

  const results = [];
  for (const { name } of profileNames ?? []) {
    // eslint-disable-next-line no-await-in-loop -- a small, bounded list
    // of profiles; sequential is simpler and this whole call already
    // has its own overall timeout above.
    const detail = await checkOneProfile(name, expiryWarningHours);
    results.push(detail);
  }
  return results;
}

async function checkOneProfile(name, expiryWarningHours) {
  try {
    const detailRes = await openhands(`/api/profiles/${encodeURIComponent(name)}`);
    const detail = await detailRes.json();
    const authType = detail.config?.auth_type;
    const vendor = detail.config?.subscription_vendor;

    if (authType !== "subscription" || !vendor) {
      // A regular API-key-based profile - nothing subscription-related
      // to check here; it either has a key set or it doesn't, which
      // is visible directly on the Agent Profiles settings page.
      return { name, ok: true, checked: false, reason: "not_subscription_based" };
    }

    const statusRes = await openhands(
      `/api/llm/subscription/${encodeURIComponent(vendor)}/status`,
    );
    const status = await statusRes.json();

    if (status.connected !== true) {
      return { name, ok: false, checked: true, vendor, reason: "not_connected" };
    }

    if (typeof status.expires_at === "number") {
      const hoursRemaining = (status.expires_at - Date.now()) / (1000 * 60 * 60);
      if (hoursRemaining <= 0) {
        return { name, ok: false, checked: true, vendor, reason: "expired" };
      }
      if (hoursRemaining <= expiryWarningHours) {
        return {
          name,
          ok: false,
          checked: true,
          vendor,
          reason: "expiring_soon",
          hoursRemaining: Math.round(hoursRemaining),
        };
      }
    }

    return { name, ok: true, checked: true, vendor };
  } catch (error) {
    return {
      name,
      ok: false,
      checked: true,
      reason: "check_failed",
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
