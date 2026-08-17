import { findAllAuthorizedConversations } from "../lib/authorize-conversation.mjs";
import { normalizeConversation } from "../lib/normalize-conversation.mjs";

export async function handleConversation(req, res) {
  if (!req.url?.startsWith("/api/conversation?")) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const project = url.searchParams.get("project");
  const employeeId = url.searchParams.get("employeeId");
  const employeeName = url.searchParams.get("employeeName");

  if (!project || !employeeId || !employeeName) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_employee_required" }));
    return true;
  }

  // BUGS_AND_FIXES.md #64: originally this made two separate calls
  // (findAuthorizedConversation + findAllAuthorizedConversations), each
  // independently paginating /api/conversations/search - doubling the
  // real request count for every one of the 14 employees polled every
  // 5 seconds. One search covers both needs: /api/conversations/search's
  // confirmed default order is newest-first, so the first matching item
  // IS the "active" conversation findAuthorizedConversation used to
  // return separately - no second call needed.
  const allMatches = await findAllAuthorizedConversations({
    project,
    employeeId,
    employeeName,
  });

  const found = allMatches[0] ?? null;

  // BUGS_AND_FIXES.md #63: totalCost sums EVERY conversation ever
  // created for this project+employee - including ones superseded by
  // "start new conversation" - not just the currently-active one.
  // Money genuinely spent on an old conversation doesn't disappear
  // just because a newer conversation now takes messaging priority;
  // the project's real total cost must keep reflecting it.
  const totalCost = allMatches.reduce((sum, conversation) => {
    const normalized = normalizeConversation(conversation);
    return sum + (normalized?.cost?.accumulatedCost ?? 0);
  }, 0);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      conversation: found ? normalizeConversation(found) : null,
      totalCost,
    }),
  );
  return true;
}
