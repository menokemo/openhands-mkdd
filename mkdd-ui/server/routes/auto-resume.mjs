import { openhands } from "../lib/openhands-client.mjs";
import { sendMessageToConversationId } from "./chat.mjs";
import { sendPushToAll } from "../lib/push-notifications.mjs";
import { withAutoResumeMarker } from "../lib/auto-resume-marker.mjs";
import { appendAutoResumeLogEntry, getAutoResumeLog } from "../lib/auto-resume-log.mjs";
import { buildHumanReadableErrorMessage } from "./internal-health.mjs";

const RESUME_MESSAGE =
  "الحد وصل لوقت إعادة التشغيل ورجع يشتغل تاني. كمل من حيث ما وقفت - راجع docs/project-context.md لآخر نقطة تحقق موثَّقة لو محتاج.";

/**
 * GET /api/internal/resume-stopped-conversations — scans every
 * conversation for any whose most recent event is a real rate/usage
 * limit error (ConversationErrorEvent, classification.kind ===
 * "rate_limit") whose resetsAt has genuinely passed, and automatically
 * sends a resume message (BUGS_AND_FIXES.md #175). Built after the
 * owner described a real incident: Kirollos stopped mid-task from a
 * usage limit with hours left, and asked for automatic resumption once
 * the limit actually clears - no manual check-back required. The
 * resume message deliberately leans on employees' own already-
 * documented Work Continuity & Recovery Standard (checking
 * project-context.md/decisions.md for the last verified checkpoint),
 * rather than trying to reconstruct recovery instructions here.
 *
 * Deliberately covers EVERY conversation, not just ones updated
 * recently - a real usage limit can take several days to reset, so a
 * conversation that stopped days ago and hasn't been checked since is
 * exactly the case this needs to catch, per explicit owner requirement.
 *
 * Self-limiting by design: once a resume message is sent, the
 * conversation's most recent event becomes that new message (not the
 * old error), so the next periodic run naturally stops re-detecting it
 * - no separate "already resumed" tracking needed. If the resume
 * message itself fails for any reason, the conversation will show a
 * fresh error on its own and be correctly retried on the next run.
 *
 * Known scaling note: checks the most recent event of every single
 * conversation one at a time - fine at the current project/employee
 * scale, but would need batching or a cheaper server-side filter if
 * conversation volume grows substantially.
 */
export async function handleResumeStoppedConversations(req, res) {
  if (!(
    req.method === "GET" && req.url === "/api/internal/resume-stopped-conversations"
  )) {
    return false;
  }

  try {
    const resumed = await resumeAllEligibleConversations();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, resumed }));
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
  return true;
}

async function resumeAllEligibleConversations() {
  const conversations = await fetchAllConversations();
  const resumed = [];

  for (const conversation of conversations) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design,
    // see the scaling note in this file's module doc comment above.
    const eligible = await checkIfEligibleForResume(conversation);
    if (!eligible) continue;

    // eslint-disable-next-line no-await-in-loop -- see above.
    const result = await sendMessageToConversationId(
      conversation.id,
      withAutoResumeMarker(RESUME_MESSAGE),
    );
    if (!result.ok) continue;

    const employeeId = conversation.tags?.mkddemployeeid ?? "?";
    const employeeName = conversation.tags?.mkddemployee ?? "?";
    const project = conversation.tags?.mkddproject ?? "?";
    resumed.push({ conversationId: conversation.id, employeeId, employeeName, project });

    // BUGS_AND_FIXES.md #176: record this so the owner can see it in the
    // employee's own insights panel instead of it appearing as a normal
    // chat message.
    appendAutoResumeLogEntry({ project, employeeId, employeeName });

    // eslint-disable-next-line no-await-in-loop -- see above.
    await sendPushToAll({
      title: "رجع يشتغل تلقائيًا",
      body: `${employeeName} كمل الشغل تاني على ${project} بعد ما الحد رجع يشتغل`,
      tag: `auto-resume-${conversation.id}`,
    });
  }

  return resumed;
}

async function fetchAllConversations() {
  const all = [];
  let pageId = null;

  do {
    const qs = new URLSearchParams({ limit: "100", sort_order: "UPDATED_AT_DESC" });
    if (pageId) qs.set("page_id", pageId);

    // eslint-disable-next-line no-await-in-loop -- paginating a single
    // sequential list, no way to parallelize without knowing the total
    // page count in advance.
    const response = await openhands(`/api/conversations/search?${qs}`);
    const data = await response.json();
    all.push(...(data.items ?? []));
    pageId = data.next_page_id ?? null;
  } while (pageId);

  return all;
}

async function checkIfEligibleForResume(conversation) {
  try {
    const eventsRes = await openhands(
      `/api/conversations/${conversation.id}/events/search?limit=1&sort_order=TIMESTAMP_DESC`,
    );
    const eventsData = await eventsRes.json();
    const lastEvent = eventsData.items?.[0];

    if (lastEvent?.kind !== "ConversationErrorEvent") return false;
    if (lastEvent.classification?.kind !== "rate_limit") return false;

    const resetsAt = extractResetsAt(lastEvent);
    if (resetsAt === null) return false;

    return Date.now() > resetsAt;
  } catch {
    // Best-effort - a failed check for one conversation must never stop
    // the scan of the rest.
    return false;
  }
}

function extractResetsAt(event) {
  const detail = event.detail ?? "";
  const firstBraceIndex = detail.indexOf("{");
  if (firstBraceIndex === -1) return null;
  try {
    const parsed = JSON.parse(detail.slice(firstBraceIndex));
    const providerInfo = parsed.error ?? parsed;
    return typeof providerInfo?.resets_at === "number"
      ? providerInfo.resets_at * 1000
      : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/employee-auto-resume-log?project=...&employeeId=... — reads
 * the auto-resume log for one project+employee (BUGS_AND_FIXES.md
 * #176), for the new "Auto-Resume" tab on the Employee Insights panel.
 * Normal owner-session authentication (not the internal service key -
 * this is called directly from the browser).
 */
export async function handleEmployeeAutoResumeLog(req, res) {
  if (!(req.method === "GET" && req.url?.startsWith("/api/employee-auto-resume-log"))) {
    return false;
  }

  const url = new URL(req.url, "http://mkdd.local");
  const project = url.searchParams.get("project");
  const employeeId = url.searchParams.get("employeeId");

  if (!project || !employeeId) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_employee_required" }));
    return true;
  }

  const entries = getAutoResumeLog(project, employeeId);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ entries }));
  return true;
}

/**
 * GET /api/internal/stopped-employees — scans every conversation for
 * any currently stopped by a real rate/usage limit (BUGS_AND_FIXES.md
 * #196), regardless of whether resetsAt has passed yet - unlike
 * checkIfEligibleForResume above (which only returns true once it's
 * time to actually resume), this is for DISPLAY on the System Health
 * screen so the owner can see every currently-stopped employee, not
 * just the one manually-configured deep_lookup employee.
 *
 * Built after the owner noticed a real, live gap: Mariam's
 * conversation was genuinely stopped by a rate limit, but the System
 * Health screen showed "all healthy" - because the existing
 * deep_lookup check only ever monitors one manually-configured
 * employee (Kirollos), never all employees.
 */
export async function handleStoppedEmployees(req, res) {
  if (!(req.method === "GET" && req.url === "/api/internal/stopped-employees")) {
    return false;
  }

  try {
    const stopped = await findAllCurrentlyStoppedEmployees();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ stopped }));
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        stopped: [],
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
  return true;
}

async function findAllCurrentlyStoppedEmployees() {
  const conversations = await fetchAllConversations();
  const stopped = [];

  for (const conversation of conversations) {
    // eslint-disable-next-line no-await-in-loop -- sequential by
    // design, same scaling note as resumeAllEligibleConversations.
    const info = await checkIfCurrentlyStoppedByRateLimit(conversation);
    if (!info) continue;

    stopped.push({
      conversationId: conversation.id,
      employeeName: conversation.tags?.mkddemployee ?? "?",
      project: conversation.tags?.mkddproject ?? "?",
      resetsAt: info.resetsAt,
      humanMessage: buildHumanReadableErrorMessage(info.event).text,
    });
  }

  return stopped;
}

async function checkIfCurrentlyStoppedByRateLimit(conversation) {
  try {
    const eventsRes = await openhands(
      `/api/conversations/${conversation.id}/events/search?limit=1&sort_order=TIMESTAMP_DESC`,
    );
    const eventsData = await eventsRes.json();
    const lastEvent = eventsData.items?.[0];

    if (lastEvent?.kind !== "ConversationErrorEvent") return null;
    if (lastEvent.classification?.kind !== "rate_limit") return null;

    const resetsAt = extractResetsAt(lastEvent);
    if (resetsAt === null) return null;

    return { resetsAt, event: lastEvent };
  } catch {
    return null;
  }
}
