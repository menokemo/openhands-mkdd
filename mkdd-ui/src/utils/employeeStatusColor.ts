import type { ConversationExecutionStatus } from "../types";

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
