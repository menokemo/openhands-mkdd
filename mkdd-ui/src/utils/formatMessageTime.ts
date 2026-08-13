/**
 * Formats a message timestamp for display next to a chat bubble.
 *
 * Shows just the time (e.g. "3:45 PM") for messages sent today, and
 * date + time for anything older, so a message from last month never
 * silently looks like it just happened.
 *
 * Returns null for a missing/invalid timestamp so callers can skip
 * rendering rather than showing a broken "Invalid Date" string.
 */
export function formatMessageTime(
  timestamp: string | undefined,
  language: "ar" | "en",
): string | null {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const locale = language === "ar" ? "ar-EG" : "en-US";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
