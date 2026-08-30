import { readJsonBody } from "../lib/read-json-body.mjs";
import { sendPushToAll } from "../lib/push-notifications.mjs";
import { findAuthorizedConversation } from "../lib/authorize-conversation.mjs";

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
