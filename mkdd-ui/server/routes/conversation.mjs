import { findAuthorizedConversation } from "../lib/authorize-conversation.mjs";
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

  // BUGS_AND_FIXES.md #65: this route is polled every 5s for all 14
  // employees - it must stay on the CHEAP, short-circuiting lookup
  // (stops at the first match) and never the exhaustive full-scan
  // used for cost totals. #63/#64 mistakenly put the exhaustive scan
  // on this hot path, which broke the UI entirely as conversation
  // volume grew. Total cost now lives on a separate, project-level,
  // less-frequently-polled endpoint (server/routes/project-cost.mjs).
  const found = await findAuthorizedConversation({ project, employeeId, employeeName });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      conversation: found ? normalizeConversation(found) : null,
    }),
  );
  return true;
}
