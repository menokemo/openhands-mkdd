import { findAllProjectConversations } from "../lib/authorize-conversation.mjs";
import { normalizeConversation } from "../lib/normalize-conversation.mjs";

/**
 * GET /api/projects/{projectSlug}/total-cost — the real sum across
 * every conversation ever created for this project (across all
 * employees, including any superseded by "start new conversation"),
 * computed via ONE exhaustive scan of /api/conversations/search
 * filtered by project (BUGS_AND_FIXES.md #65).
 *
 * Deliberately a separate, standalone endpoint rather than bundled
 * into the per-employee /api/conversation route: that route is polled
 * every 5 seconds for all 14 employees and must stay on the cheap,
 * short-circuiting conversation lookup. This exhaustive scan belongs
 * on its own, much-less-frequent refresh schedule instead.
 */
export async function handleProjectTotalCost(req, res) {
  const match = req.url?.match(/^\/api\/projects\/([^/]+)\/total-cost$/);
  if (!(req.method === "GET" && match)) return false;

  const projectSlug = decodeURIComponent(match[1]);
  const project = `/projects/${projectSlug}`;

  const conversations = await findAllProjectConversations(project);

  const totalCost = conversations.reduce((sum, conversation) => {
    const normalized = normalizeConversation(conversation);
    return sum + (normalized?.cost?.accumulatedCost ?? 0);
  }, 0);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ totalCost }));
  return true;
}
