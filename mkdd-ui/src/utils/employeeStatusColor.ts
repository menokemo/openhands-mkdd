import type { ConversationExecutionStatus } from "../types";

const statusText = {
  ar: {
    idle: "جاهز",
    running: "يعمل الآن",
    paused: "متوقف مؤقتًا",
    waiting_for_confirmation: "بانتظار موافقتك",
    finished: "اكتمل",
    error: "خطأ",
    stuck: "متعثر",
    deleting: "جارٍ الحذف",
    unknown: "غير متاح",
  },
  en: {
    idle: "Ready",
    running: "Working",
    paused: "Paused",
    waiting_for_confirmation: "Waiting for approval",
    finished: "Finished",
    error: "Error",
    stuck: "Stuck",
    deleting: "Deleting",
    unknown: "Unavailable",
  },
} as const;

/**
 * Human-readable execution status text (BUGS_AND_FIXES.md #223) - used
 * as the Telegram-style "status line" shown directly under the
 * employee's name in the chat header, and by the profile modal's own
 * status badge, from a single shared source.
 */
export function getStatusText(
  status: ConversationExecutionStatus | null,
  language: "ar" | "en",
): string {
  return statusText[language][status ?? "unknown"];
}

/**
 * Maps a conversation execution status to its shared color category
 * (BUGS_AND_FIXES.md #222) - used by both the employee-details modal
 * trigger and, since #222, the chat header avatar's glow border, so
 * both consistently reflect the employee's current activity at a
 * glance from a single source of truth.
 */
export function statusColorClass(status: ConversationExecutionStatus | null): string {
  switch (status) {
    case "running":
      return "status-color-running";
    case "waiting_for_confirmation":
      return "status-color-waiting";
    case "paused":
      return "status-color-paused";
    case "error":
    case "stuck":
      return "status-color-danger";
    case "finished":
      return "status-color-finished";
    default:
      return "status-color-idle";
  }
}
