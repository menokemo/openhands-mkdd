import { openhands } from "./openhands-client.mjs";

/**
 * The single source of truth for "does this OpenHands conversation belong
 * to this MKDD project + employee?" (README section 7, "Conversation
 * Isolation" / matching rule).
 *
 * Match by project + stable employee ID; fall back to exact employee-name
 * matching only for legacy conversations that predate the
 * `mkddemployeeid` tag.
 *
 * PROJECT_AUDIT_REPORT.md flagged this predicate as duplicated across three
 * routes (GET /api/conversation, POST /api/chat/send, GET /api/chat/events).
 * It must now live in exactly one place so a future change to the matching
 * rule cannot be applied in some routes and forgotten in others.
 */
export function matchesEmployee(conversation, { project, employeeId, employeeName }) {
  if (conversation.tags?.mkddproject !== project) return false;

  if (conversation.tags?.mkddemployeeid) {
    return conversation.tags.mkddemployeeid === employeeId;
  }

  return conversation.tags?.mkddemployee === employeeName;
}

/**
 * Paginates through /api/conversations/search looking for a conversation
 * that matches the given project/employee. Optionally also requires a
 * specific conversation ID (used by /api/chat/events, which must confirm
 * the caller is authorized for *that exact* conversation, not just any
 * conversation belonging to the employee).
 *
 * Returns the matching conversation, or null if none was found after
 * exhausting all pages.
 */
export async function findAuthorizedConversation({
  project,
  employeeId,
  employeeName,
  conversationId = null,
}) {
  let pageId = null;
  let match = null;

  do {
    const qs = new URLSearchParams({ limit: "100" });
    if (pageId) qs.set("page_id", pageId);

    const response = await openhands(`/api/conversations/search?${qs}`);
    const data = await response.json();

    match =
      (data.items ?? []).find(
        (conversation) =>
          (conversationId === null || conversation.id === conversationId) &&
          matchesEmployee(conversation, { project, employeeId, employeeName }),
      ) ?? null;

    pageId = match ? null : (data.next_page_id ?? null);
  } while (!match && pageId);

  return match;
}
