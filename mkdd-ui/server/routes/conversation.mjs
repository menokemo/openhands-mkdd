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

  const found = await findAuthorizedConversation({
    project,
    employeeId,
    employeeName,
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      conversation: found ? normalizeConversation(found) : null,
    }),
  );
  return true;
}
