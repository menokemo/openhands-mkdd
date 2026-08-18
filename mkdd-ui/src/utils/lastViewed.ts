// Tracks when the owner last viewed each employee's conversation, to
// power the unread-message badge on the team strip (BUGS_AND_FIXES.md
// #106). Stored in localStorage - this is the real MKDD app (not an
// artifact), so browser storage is fine here, and per-device "last
// viewed" state is exactly the right scope for a single-owner app with
// no real multi-device sync requirement.

const KEY_PREFIX = "mkdd-last-viewed:";

export function markConversationAsViewed(employeeId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + employeeId, new Date().toISOString());
  } catch {
    // Private browsing / storage disabled - badge just won't clear, not fatal.
  }
}

export function getLastViewedAt(employeeId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + employeeId);
  } catch {
    return null;
  }
}

/**
 * Whether the employee has an unread message: their conversation's most
 * recent message came from the agent (not the owner) and arrived after
 * the owner last viewed it.
 */
export function hasUnreadMessage(
  employeeId: string,
  lastMessageAt: string | null,
  lastMessageFrom: string | null,
): boolean {
  if (!lastMessageAt || lastMessageFrom !== "agent") return false;
  const lastViewedAt = getLastViewedAt(employeeId);
  if (!lastViewedAt) return true;
  return Date.parse(lastMessageAt) > Date.parse(lastViewedAt);
}
