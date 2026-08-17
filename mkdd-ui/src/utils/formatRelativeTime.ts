/**
 * Formats a timestamp as a short relative duration (e.g. "2h ago",
 * "منذ ٥ دقايق") for compact dashboard cards (blockers, findings) -
 * distinct from formatMessageTime, which shows absolute clock time for
 * chat bubbles.
 *
 * Falls back to a short absolute date once the duration is long enough
 * (>= 7 days) that "Xd ago" stops being a genuinely useful summary.
 */
export function formatRelativeTime(
  timestamp: string | undefined,
  language: "ar" | "en",
): string | null {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return language === "ar" ? "الآن" : "just now";
  }
  if (diffMinutes < 60) {
    return language === "ar" ? `منذ ${diffMinutes} د` : `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return language === "ar" ? `منذ ${diffHours} س` : `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return language === "ar" ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
  }

  const locale = language === "ar" ? "ar-EG" : "en-US";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
