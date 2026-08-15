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
    const [employeeDisplayName, projectDisplayName] = await Promise.all([
      Promise.resolve(resolveEmployeeDisplayName(employeeId, employeeName)),
      resolveProjectDisplayName(project),
    ]);

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
        agent_profile_id: employeeId,
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

    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(JSON.stringify({ conversation: created }));
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
