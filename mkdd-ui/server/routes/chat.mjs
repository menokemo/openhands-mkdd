import { OPENHANDS_URL, sessionKey, openhands } from "../lib/openhands-client.mjs";
import { findAuthorizedConversation } from "../lib/authorize-conversation.mjs";
import { normalizeConversation } from "../lib/normalize-conversation.mjs";
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
 * findAuthorizedConversation explicitly requests sort_order=
 * UPDATED_AT_DESC (BUGS_AND_FIXES.md #122) - a newly created
 * conversation's most recent update IS its creation, so it still
 * naturally sorts first and becomes the one findAuthorizedConversation
 * returns next, exactly as it did under the old (undocumented) default
 * - no change needed to the search/matching logic itself for a "start
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

  // BUGS_AND_FIXES.md #173: OpenHands' create-conversation payload
  // (StartConversationRequest) no longer has a `title` field at all in
  // the current agent-server (only autotitle/title_llm_profile) - a
  // previous title field sent in the request above was silently
  // dropped by the server, confirmed live: real conversations were
  // showing title: null despite the field being sent. The server DOES
  // support setting a title, but only via a separate follow-up call
  // (UpdateConversationRequest, PATCH /api/conversations/{id}) after
  // creation - so that's what actually sets it now. Best-effort: a
  // failed title update must never fail the conversation creation
  // itself, since the conversation is already real and usable either
  // way.
  try {
    await fetch(OPENHANDS_URL + `/api/conversations/${created.id}`, {
      method: "PATCH",
      headers: {
        "X-Session-API-Key": sessionKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // BUGS_AND_FIXES.md #174: the explicit "start new conversation"
        // button (#61) intentionally creates multiple real conversations
        // for the same employee+project pair - a genuinely common,
        // deliberate action, not a rare edge case. Without a
        // distinguishing detail, every one would carry the exact same
        // static title, making them indistinguishable in OpenHands' own
        // UI. A readable date/time helps at a glance, but live testing
        // proved timestamp precision alone isn't a real guarantee - two
        // conversations created within the same minute (a realistic
        // scenario using the button twice in quick succession) still
        // produced identical titles, even with seconds added. The
        // conversation's own real ID (a genuine UUID) is the only true
        // guarantee against collision, so the last 4 characters of it
        // are appended as well.
        title: `${employeeDisplayName} — ${projectDisplayName} · ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} · ${created.id.slice(-4)}`,
      }),
    });
  } catch {
    // Best-effort - see comment above.
  }

  return { ok: true, status: r.status, body: { conversation: created } };
}

/**
 * Delivers a message into an employee's conversation for a project -
 * reusing the exact same logic as /api/chat/send (find existing
 * conversation and send into it, or create a new one if none exists),
 * but callable directly from other server-side code without an HTTP
 * request/response cycle (BUGS_AND_FIXES.md #154). Used by the reports
 * system to deliver a report directly into the receiving employee's
 * conversation the moment it's filed - MKDD's own backend is the only
 * place real conversation-creation credentials exist (see AGENTS.md's
 * documented security boundary: no employee process can start or
 * message into another employee's conversation directly), so this is
 * the correct place for that capability to live.
 */
export async function deliverMessageToEmployee({
  project,
  employeeId,
  employeeName,
  message,
}) {
  const conversation = await findAuthorizedConversation({
    project,
    employeeId,
    employeeName,
  });

  if (!conversation) {
    return createNewConversation({ project, employeeId, employeeName, message });
  }

  const r = await fetch(OPENHANDS_URL + `/api/conversations/${conversation.id}/events`, {
    method: "POST",
    headers: {
      "X-Session-API-Key": sessionKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "user",
      content: buildOutgoingContent(message),
      run: true,
    }),
  });

  return { ok: r.ok, status: r.status, body: { conversation_id: conversation.id } };
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
 * since findAuthorizedConversation explicitly sorts by
 * UPDATED_AT_DESC (BUGS_AND_FIXES.md #122), the new conversation's
 * creation IS its most recent update, so it naturally becomes the one
 * MKDD's own UI resolves to going forward (BUGS_AND_FIXES.md #61:
 * needed when an existing conversation is stuck in an unrecoverable
 * state, e.g. one created before a condenser fix was applied to the
 * employee's profile).
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

/**
 * Fetches ONLY the most recent `limit` events (BUGS_AND_FIXES.md #121),
 * using the real sort_order=TIMESTAMP_DESC support confirmed directly
 * in the upstream Agent Canvas source (event-service.api.ts) - a single
 * request for the newest page, instead of fetchAllNormalizedEvents'
 * walk through the ENTIRE history from the beginning. This is what
 * makes the chat screen open fast like a real messaging app, matching
 * the explicit request: load recent messages immediately, older ones
 * on demand.
 *
 * Returns events oldest-first within the fetched page (matching what
 * the UI expects to render top-to-bottom), plus whether older events
 * exist and the page_id needed to fetch them (see fetchOlderEvents).
 */
async function fetchRecentEvents(conversationId, limit) {
  const eventQs = new URLSearchParams({
    limit: String(limit),
    sort_order: "TIMESTAMP_DESC",
  });

  const eventsResponse = await openhands(
    `/api/conversations/${conversationId}/events/search?${eventQs}`,
  );

  if (!eventsResponse.ok) {
    return { status: eventsResponse.status, items: [], hasMore: false, nextPageId: null };
  }

  const pageData = await eventsResponse.json();
  const items = (pageData.items ?? []).slice().reverse(); // newest-first -> oldest-first

  return {
    status: eventsResponse.status,
    items: items.map(normalizeEvent).filter(Boolean),
    hasMore: Boolean(pageData.next_page_id),
    nextPageId: pageData.next_page_id ?? null,
  };
}

/**
 * Fetches the NEXT (older) page following on from a previous
 * fetchRecentEvents/fetchOlderEvents call's nextPageId - same
 * TIMESTAMP_DESC pagination, one page further back in time.
 */
async function fetchOlderEvents(conversationId, pageId, limit) {
  const eventQs = new URLSearchParams({
    limit: String(limit),
    sort_order: "TIMESTAMP_DESC",
    page_id: pageId,
  });

  const eventsResponse = await openhands(
    `/api/conversations/${conversationId}/events/search?${eventQs}`,
  );

  if (!eventsResponse.ok) {
    return { status: eventsResponse.status, items: [], hasMore: false, nextPageId: null };
  }

  const pageData = await eventsResponse.json();
  const items = (pageData.items ?? []).slice().reverse();

  return {
    status: eventsResponse.status,
    items: items.map(normalizeEvent).filter(Boolean),
    hasMore: Boolean(pageData.next_page_id),
    nextPageId: pageData.next_page_id ?? null,
  };
}

/**
 * Fetches every page of events for a conversation, de-duplicates by id,
 * sorts by timestamp, and normalizes each event - shared by
 * handleChatEvents (full event list for the chat screen) and
 * handleChatWorkPlan (BUGS_AND_FIXES.md #66: work plan only, without
 * the full event payload - a conversation's full event history can be
 * hundreds of KB, and the team-status strip only ever needed the small
 * derived work_plan from it, not the raw events themselves).
 */
async function fetchAllNormalizedEvents(conversationId) {
  let eventsPageId = null;
  let eventsStatus = 200;
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
      return { status: eventsStatus, items: [] };
    }

    allEventItems.push(...(pageData.items ?? []));
    eventsPageId = pageData.next_page_id ?? null;
  } while (eventsPageId);

  const uniqueEvents = new Map();
  for (const event of allEventItems) {
    if (event?.id) uniqueEvents.set(event.id, event);
  }

  const sorted = Array.from(uniqueEvents.values()).sort((a, b) => {
    const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
    return aTime - bTime;
  });

  return {
    status: eventsStatus,
    items: sorted.map(normalizeEvent).filter(Boolean),
  };
}

const RECENT_EVENTS_PAGE_SIZE = 50;

/**
 * GET /api/chat/open — the chat screen's actual initial load
 * (BUGS_AND_FIXES.md #121). Combines what used to be two separate
 * sequential round-trips (GET /api/conversation, then GET
 * /api/chat/events) into a SINGLE request: resolves the authorized
 * conversation once, then fetches only its most recent
 * RECENT_EVENTS_PAGE_SIZE messages (not the full history - see
 * fetchRecentEvents above). This is the real fix for the reported
 * chat-open delay - not just running two requests in parallel (the
 * events fetch genuinely needs the conversation id the lookup
 * produces, so true parallelism there was never actually possible),
 * but eliminating the redundant second round-trip entirely.
 */
export async function handleChatOpen(req, res) {
  if (!req.url?.startsWith("/api/chat/open?")) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const project = url.searchParams.get("project");
  const employeeId = url.searchParams.get("employeeId");
  const employeeName = url.searchParams.get("employeeName");

  if (!project || !employeeId || !employeeName) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_employee_required" }));
    return true;
  }

  const found = await findAuthorizedConversation({ project, employeeId, employeeName });

  if (!found) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ conversation: null }));
    return true;
  }

  const conversation = normalizeConversation(found);
  const { status, items, hasMore, nextPageId } = await fetchRecentEvents(
    conversation.id,
    RECENT_EVENTS_PAGE_SIZE,
  );

  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      conversation,
      items,
      hasMore,
      nextPageId,
      work_plan: deriveWorkPlan(items),
    }),
  );
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

  const { status, items } = await fetchAllNormalizedEvents(conversationId);

  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ items, next_page_id: null, work_plan: deriveWorkPlan(items) }),
  );
  return true;
}

/**
 * GET /api/chat/events/recent — the chat screen's actual initial load
 * (BUGS_AND_FIXES.md #121), replacing the old handleChatEvents (which
 * still exists above for callers needing the truly full history, none
 * currently do from the frontend chat screen anymore). Returns only
 * the most recent RECENT_EVENTS_PAGE_SIZE events, fast, plus whether
 * older ones exist so the UI can offer to load them on scroll-up.
 */
export async function handleChatRecentEvents(req, res) {
  if (!req.url?.startsWith("/api/chat/events/recent?")) return false;

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

  const { status, items, hasMore, nextPageId } = await fetchRecentEvents(
    conversationId,
    RECENT_EVENTS_PAGE_SIZE,
  );

  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ items, hasMore, nextPageId, work_plan: deriveWorkPlan(items) }),
  );
  return true;
}

/**
 * GET /api/chat/events/older — loads the next page of older events
 * when the owner scrolls to the top of the chat, using the pageId
 * returned by a previous /recent or /older call.
 */
export async function handleChatOlderEvents(req, res) {
  if (!req.url?.startsWith("/api/chat/events/older?")) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const conversationId = url.searchParams.get("conversation");
  const project = url.searchParams.get("project");
  const employeeId = url.searchParams.get("employeeId");
  const employeeName = url.searchParams.get("employeeName");
  const pageId = url.searchParams.get("pageId");

  if (!conversationId || !project || !employeeId || !employeeName || !pageId) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "conversation_project_employee_pageId_required" }));
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

  const { status, items, hasMore, nextPageId } = await fetchOlderEvents(
    conversationId,
    pageId,
    RECENT_EVENTS_PAGE_SIZE,
  );

  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ items, hasMore, nextPageId }));
  return true;
}

/**
 * GET /api/chat/work-plan — like /api/chat/events, but returns ONLY the
 * derived work_plan, never the full event list. Used by the frequent
 * (5s x 14 employees) team-status poll, which only ever needed the
 * small derived summary - fetching the full event history there
 * (sometimes hundreds of KB for a long-running conversation) added
 * real, unnecessary network transfer on every poll (BUGS_AND_FIXES.md
 * #66).
 */
export async function handleChatWorkPlan(req, res) {
  if (!req.url?.startsWith("/api/chat/work-plan?")) return false;

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

  const { status, items } = await fetchAllNormalizedEvents(conversationId);

  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ work_plan: deriveWorkPlan(items) }));
  return true;
}

/**
 * GET /api/chat/last-message — like /api/chat/work-plan, returns ONLY
 * the most recent message event's timestamp and sender ("user" or
 * "agent"), never the full event list. Powers the unread-message badge
 * on the team strip (BUGS_AND_FIXES.md #106): the frontend compares
 * this against a locally-remembered "last viewed" timestamp per
 * employee to decide whether to show a badge, without needing to fetch
 * (and re-fetch every 5s x 14 employees) the full conversation history.
 */
export async function handleChatLastMessage(req, res) {
  if (!req.url?.startsWith("/api/chat/last-message?")) return false;

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

  const { status, items } = await fetchAllNormalizedEvents(conversationId);
  const messages = items.filter((item) => item.kind === "MessageEvent");
  const last = messages.length > 0 ? messages[messages.length - 1] : null;

  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      lastMessageAt: last?.timestamp ?? null,
      lastMessageFrom: last?.source ?? null,
    }),
  );
  return true;
}
