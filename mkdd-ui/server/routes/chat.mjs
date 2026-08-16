import { OPENHANDS_URL, sessionKey, openhands } from "../lib/openhands-client.mjs";
import { findAuthorizedConversation } from "../lib/authorize-conversation.mjs";
import { normalizeEvent } from "../lib/normalize-event.mjs";
import { deriveWorkPlan } from "../lib/work-plan.mjs";
import { readEmployeeDisplayInfo } from "../lib/employee-display-info.mjs";
import { withTimeContext } from "../lib/time-context.mjs";

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

/**
 * Looks up the human-readable project name from the registered workspace
 * list (the single source of truth - see server/routes/projects.mjs),
 * falling back to the raw path if the workspace can't be found for any
 * reason (should not normally happen, since `project` always comes from
 * a workspace fetchProjects() already read from this same list).
 */
async function resolveProjectDisplayName(projectPath) {
  try {
    const r = await openhands("/api/workspaces");
    const data = await r.json();
    const match = (data.workspaces ?? []).find((w) => w.path === projectPath);
    return match?.name ?? projectPath;
  } catch {
    return projectPath;
  }
}

function resolveEmployeeDisplayName(employeeId, employeeName) {
  try {
    return readEmployeeDisplayInfo(employeeId).displayNameEn ?? employeeName;
  } catch {
    return employeeName;
  }
}

/**
 * Resolves an employee's human-readable id (e.g. "architect") to the
 * real UUID agent-server assigned that profile internally.
 *
 * BUGS_AND_FIXES.md #48: after the v1.13.0 upgrade (agent-server 1.42.1),
 * POST /api/conversations started rejecting the plain name/slug for
 * agent_profile_id with a real 422 ("Input should be a valid UUID") -
 * confirmed live via a direct curl reproducing our exact request. Older
 * conversations (created before the upgrade) kept working since they
 * were never re-validated; every brand-new conversation failed silently
 * until this was traced. GET /api/agent-profiles/{name} returns
 * {name, profile: {id: <uuid>, ...}} - that id is what conversations
 * actually need now.
 */
async function resolveAgentProfileUuid(employeeId) {
  const r = await openhands(`/api/agent-profiles/${employeeId}`);
  if (!r.ok) return null;
  const data = await r.json();
  return data?.profile?.id ?? null;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB, matches avatars.mjs
const MAX_IMAGES_PER_MESSAGE = 4;

export function validateImageDataUrls(imageDataUrls) {
  if (!Array.isArray(imageDataUrls) || imageDataUrls.length === 0) return null;

  if (imageDataUrls.length > MAX_IMAGES_PER_MESSAGE) {
    return "too_many_images";
  }

  for (const dataUrl of imageDataUrls) {
    const match =
      typeof dataUrl === "string" &&
      dataUrl.match(/^data:image\/(?:png|jpeg|webp|gif);base64,(.+)$/);

    if (!match) return "invalid_image_data_url";

    // Rough size check from the base64 payload length rather than
    // decoding every image up front - base64 expands data by ~4/3, so
    // this is a safe (slightly conservative) upper-bound estimate.
    const approxBytes = (match[1].length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) return "image_too_large";
  }

  return null;
}

export function buildOutgoingContent(message, imageDataUrls) {
  const content = [];

  // The time-context marker always goes on a text block, even an empty
  // one, so the employee still gets live time-awareness on image-only
  // messages (BUGS_AND_FIXES.md #25 remains in effect for every message).
  content.push({ type: "text", text: withTimeContext(message?.trim() ?? "") });

  if (Array.isArray(imageDataUrls) && imageDataUrls.length > 0) {
    // Real shape confirmed from openhands-agent-canvas's own
    // MessageImageContent type: {type:"image", image_urls: string[]}.
    content.push({ type: "image", image_urls: imageDataUrls });
  }

  return content;
}

/**
 * Creates a brand-new OpenHands conversation for a project+employee,
 * unconditionally (no existing-conversation check) - shared by
 * handleChatSend's create-if-missing path and handleChatNew's always-
 * create path (BUGS_AND_FIXES.md #61).
 *
 * Because /api/conversations/search defaults to CREATED_AT_DESC (most
 * recently created first - confirmed live via the real OpenAPI schema),
 * a newly created conversation with the same project/employee tags
 * naturally becomes the one findAuthorizedConversation returns next -
 * no change needed to the search/matching logic itself for a "start
 * fresh" conversation to actually take over as the active one.
 *
 * Returns { ok, status, body } - callers decide how to write the HTTP
 * response, since handleChatSend and handleChatNew shape it slightly
 * differently.
 */
async function createNewConversation({
  project,
  employeeId,
  employeeName,
  message,
  imageDataUrls,
}) {
  const [employeeDisplayName, projectDisplayName, agentProfileUuid] = await Promise.all([
    Promise.resolve(resolveEmployeeDisplayName(employeeId, employeeName)),
    resolveProjectDisplayName(project),
    resolveAgentProfileUuid(employeeId),
  ]);

  if (!agentProfileUuid) {
    return { ok: false, status: 404, body: { error: "agent_profile_not_found" } };
  }

  const r = await fetch(OPENHANDS_URL + "/api/conversations", {
    method: "POST",
    headers: {
      "X-Session-API-Key": sessionKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspace: {
        working_dir: project,
        kind: "LocalWorkspace",
      },
      agent_profile_id: agentProfileUuid,
      autotitle: false,
      // Confirmed real field (README/ENGINEERING_PRINCIPLES.md #1): the
      // real Agent Canvas create-conversation payload sends `title`
      // (see use-create-conversation.ts). Without it, conversations
      // MKDD creates show up unnamed in Agent Canvas's own UI
      // (BUGS_AND_FIXES.md #24).
      title: `${employeeDisplayName} — ${projectDisplayName}`,
      tags: {
        mkddproject: project,
        mkddemployee: employeeName,
        mkddemployeeid: employeeId,
      },
      initial_message: {
        role: "user",
        content: buildOutgoingContent(message, imageDataUrls),
        run: true,
      },
    }),
  });

  const created = await r.json();

  if (!r.ok) {
    // BUGS_AND_FIXES.md #48: this branch used to blindly wrap whatever
    // OpenHands returned as {conversation: created} regardless of
    // success/failure - so a real creation failure (e.g. a 422 from
    // OpenHands) had no top-level .error field, and the frontend fell
    // back to a generic "send_message_failed" string that hid the
    // actual reason. Surface it properly instead.
    return {
      ok: false,
      status: r.status,
      body: {
        error: created?.detail ?? created?.error ?? "conversation_creation_failed",
        detail: created,
      },
    };
  }

  return { ok: true, status: r.status, body: { conversation: created } };
}

export async function handleChatSend(req, res) {
  if (!(req.method === "POST" && req.url === "/api/chat/send")) return false;

  const { project, employeeId, employeeName, message, imageDataUrls } =
    await readJsonBody(req);

  const hasText = typeof message === "string" && message.trim().length > 0;
  const hasImages = Array.isArray(imageDataUrls) && imageDataUrls.length > 0;

  if (!project || !employeeId || !employeeName || (!hasText && !hasImages)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_request" }));
    return true;
  }

  if (hasImages) {
    const imageError = validateImageDataUrls(imageDataUrls);
    if (imageError) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: imageError }));
      return true;
    }
  }

  const conversation = await findAuthorizedConversation({
    project,
    employeeId,
    employeeName,
  });

  if (!conversation) {
    const result = await createNewConversation({
      project,
      employeeId,
      employeeName,
      message,
      imageDataUrls,
    });
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
    return true;
  }

  const r = await fetch(OPENHANDS_URL + `/api/conversations/${conversation.id}/events`, {
    method: "POST",
    headers: {
      "X-Session-API-Key": sessionKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "user",
      content: buildOutgoingContent(message, imageDataUrls),
      run: true,
    }),
  });

  const result = await r.json();

  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      conversation_id: conversation.id,
      result,
    }),
  );
  return true;
}

/**
 * POST /api/chat/new — always creates a brand-new conversation for a
 * project+employee, even if one already exists (unlike /api/chat/send's
 * create-if-missing behavior). The old conversation is not deleted or
 * modified - it stays reachable directly in OpenHands's own UI - but
 * because /api/conversations/search returns newest-first by default,
 * the new conversation naturally becomes the one MKDD's own UI resolves
 * to going forward (BUGS_AND_FIXES.md #61: needed when an existing
 * conversation is stuck in an unrecoverable state, e.g. one created
 * before a condenser fix was applied to the employee's profile).
 */
export async function handleChatNew(req, res) {
  if (!(req.method === "POST" && req.url === "/api/chat/new")) return false;

  const { project, employeeId, employeeName, message, imageDataUrls } =
    await readJsonBody(req);

  const hasText = typeof message === "string" && message.trim().length > 0;
  const hasImages = Array.isArray(imageDataUrls) && imageDataUrls.length > 0;

  if (!project || !employeeId || !employeeName || (!hasText && !hasImages)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_request" }));
    return true;
  }

  if (hasImages) {
    const imageError = validateImageDataUrls(imageDataUrls);
    if (imageError) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: imageError }));
      return true;
    }
  }

  const result = await createNewConversation({
    project,
    employeeId,
    employeeName,
    message,
    imageDataUrls,
  });
  res.writeHead(result.status, { "content-type": "application/json" });
  res.end(JSON.stringify(result.body));
  return true;
}

export async function handleChatEvents(req, res) {
  if (!req.url?.startsWith("/api/chat/events?")) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const conversationId = url.searchParams.get("conversation");
  const project = url.searchParams.get("project");
  const employeeId = url.searchParams.get("employeeId");
  const employeeName = url.searchParams.get("employeeName");

  if (!conversationId || !project || !employeeId || !employeeName) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "conversation_project_employee_required" }));
    return true;
  }

  const authorizedConversation = await findAuthorizedConversation({
    conversationId,
    project,
    employeeId,
    employeeName,
  });

  if (!authorizedConversation) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "conversation_employee_mismatch" }));
    return true;
  }

  // Fetch every page of events for this conversation, then de-duplicate by
  // id and sort by timestamp (defensive: OpenHands' own pagination should
  // already be gap-free, but this guards against duplicate/out-of-order
  // pages under retries).
  let eventsPageId = null;
  let eventsStatus = 200;
  let data = { items: [], next_page_id: null };
  const allEventItems = [];

  do {
    const eventQs = new URLSearchParams({ limit: "100" });
    if (eventsPageId) eventQs.set("page_id", eventsPageId);

    const eventsResponse = await openhands(
      `/api/conversations/${conversationId}/events/search?${eventQs}`,
    );

    eventsStatus = eventsResponse.status;
    const pageData = await eventsResponse.json();

    if (!eventsResponse.ok) {
      data = pageData;
      break;
    }

    allEventItems.push(...(pageData.items ?? []));
    eventsPageId = pageData.next_page_id ?? null;
    data = pageData;
  } while (eventsPageId);

  if (eventsStatus >= 200 && eventsStatus < 300) {
    const uniqueEvents = new Map();

    for (const event of allEventItems) {
      if (event?.id) uniqueEvents.set(event.id, event);
    }

    data = {
      ...data,
      items: Array.from(uniqueEvents.values()).sort((a, b) => {
        const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
        const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
        return aTime - bTime;
      }),
      next_page_id: null,
    };
  }

  data.items = (data.items ?? []).map(normalizeEvent).filter(Boolean);
  data.work_plan = deriveWorkPlan(data.items);

  res.writeHead(eventsStatus, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
  return true;
}
