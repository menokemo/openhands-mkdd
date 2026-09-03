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
 * Filters conversations by PROJECT only (no employee filter) - one
 * exhaustive scan covers every employee's conversations for a project
 * at once, instead of one exhaustive scan per employee
 * (BUGS_AND_FIXES.md #65: an earlier per-employee exhaustive-scan
 * design, even after removing a duplicate request, still ran a full
 * scan on every 5-second poll for all 14 employees, which broke the
 * UI entirely as conversation volume grew). Intended for a project-
 * level cost total, computed once and refreshed on a much slower
 * schedule than the per-employee status poll.
 */
/**
 * Paginates through EVERY conversation on the server exactly once,
 * returning the full raw list. Callers filter locally afterward
 * (BUGS_AND_FIXES.md #145) - critical performance fix: previously,
 * findAllProjectConversations re-paginated through the ENTIRE
 * conversation list from scratch on every single call, and
 * handleProjects called it once PER PROJECT - so N projects meant N
 * full re-scans of everything, even though each scan visited the
 * exact same pages. After days of heavy testing had accumulated many
 * conversations, this made /api/projects take minutes and eventually
 * time out (502). This function paginates once; findAllProjectConversations
 * below now just filters the already-fetched list, and handleProjects
 * fetches this once total, not once per project.
 */
export async function fetchAllConversations() {
  let pageId = null;
  const all = [];

  do {
    const qs = new URLSearchParams({ limit: "100", sort_order: "UPDATED_AT_DESC" });
    if (pageId) qs.set("page_id", pageId);

    const response = await openhands(`/api/conversations/search?${qs}`);
    const data = await response.json();

    all.push(...(data.items ?? []));
    pageId = data.next_page_id ?? null;
  } while (pageId);

  return all;
}

/**
 * Filters an already-fetched conversation list (see fetchAllConversations
 * above) down to the ones belonging to a specific project - no network
 * call of its own, purely a local filter.
 */
export function findAllProjectConversations(project, allConversations) {
  return allConversations.filter(
    (conversation) => conversation.tags?.mkddproject === project,
  );
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
    const qs = new URLSearchParams({ limit: "100", sort_order: "UPDATED_AT_DESC" });
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

/**
 * Every conversation ever created for a specific employee+project (not
 * just one match), sorted oldest-first (BUGS_AND_FIXES.md #218) - used
 * to walk backward through "start new conversation" history when the
 * owner scrolls up in the chat, similar to how #65's total-cost
 * endpoint already scans every past conversation for the cost sum, just
 * for display here instead.
 */
export async function findAllEmployeeConversations({
  project,
  employeeId,
  employeeName,
}) {
  const allConversations = await fetchAllConversations();
  const matching = allConversations.filter((conversation) =>
    matchesEmployee(conversation, { project, employeeId, employeeName }),
  );
  // fetchAllConversations sorts UPDATED_AT_DESC (newest first) - reverse
  // for oldest-first, matching the order the owner would scroll through.
  return matching.reverse();
}
