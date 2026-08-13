/**
 * Shared OpenHands event normalization.
 *
 * This is "Phase A" from REALTIME_CHAT_RESEARCH.md: the normalizer must be a
 * single top-level helper used by both REST history and (eventually) the
 * live WebSocket bridge, so the two transports never drift apart.
 *
 * It also fixes BUGS_AND_FIXES.md bug #3 ("Message content normalization
 * mismatch"): OpenHands' own type definitions always describe message
 * content as an array of {type, text} items, but some call sites can still
 * hand us a raw string. `textContent` now accepts both shapes and always
 * returns the array form the UI expects.
 */

import { stripTimeContext } from "./time-context.mjs";

/**
 * Normalizes message content into the array-of-TextContent shape that
 * OpenHands' own MessageEvent.llm_message.content type uses
 * ((TextContent | ImageContent)[]), accepting a raw string as a
 * convenience input.
 */
export function textContent(content) {
  if (typeof content === "string") {
    return content.trim() ? [{ type: "text", text: content }] : [];
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item && item.type === "text" && typeof item.text === "string")
      .map((item) => ({ type: "text", text: item.text }));
  }

  return [];
}

/**
 * Reduces a raw OpenHands event down to the safe fields the MKDD Activity
 * UI is allowed to show (see README section 16). Returns null for event
 * kinds that are not in the supported/safe category list, so the caller
 * can filter them out (hidden chain-of-thought must never reach the UI).
 */
export function normalizeEvent(event) {
  const base = {
    id: event.id,
    kind: event.kind,
    source: event.source,
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
  };

  switch (event.kind) {
    case "MessageEvent": {
      const content = textContent(event.llm_message?.content);
      // Only user messages ever carry the time-context marker (see
      // server/lib/time-context.mjs) - strip it here so neither transport
      // (REST or WebSocket, both routed through this same function) ever
      // shows it to the browser. It's only injected on the first content
      // item, matching how it's always constructed on the way out.
      const cleaned =
        base.source === "user"
          ? content.map((item, i) =>
              i === 0 ? { ...item, text: stripTimeContext(item.text) } : item,
            )
          : content;

      return {
        ...base,
        llm_message: { content: cleaned },
      };
    }

    case "ActionEvent":
      return {
        ...base,
        ...(typeof event.summary === "string" ? { summary: event.summary } : {}),
        ...(typeof event.tool_name === "string" ? { tool_name: event.tool_name } : {}),
      };

    case "ObservationEvent":
      return {
        ...base,
        ...(typeof event.action_id === "string" ? { action_id: event.action_id } : {}),
        ...(typeof event.tool_name === "string" ? { tool_name: event.tool_name } : {}),
        content: textContent(event.observation?.content),
        is_error: event.observation?.is_error === true,
        ...(event.tool_name === "task_tracker" &&
        (event.observation?.command === "view" ||
          event.observation?.command === "plan") &&
        Array.isArray(event.observation?.task_list)
          ? {
              task_tracker: {
                command: event.observation.command,
                task_list: event.observation.task_list
                  .filter(
                    (task) =>
                      task &&
                      typeof task.title === "string" &&
                      (task.status === "todo" ||
                        task.status === "in_progress" ||
                        task.status === "done"),
                  )
                  .map((task) => ({
                    title: task.title,
                    notes: typeof task.notes === "string" ? task.notes : "",
                    status: task.status,
                  })),
              },
            }
          : {}),
      };

    case "AgentErrorEvent":
      return {
        ...base,
        ...(typeof event.error === "string" ? { error: event.error } : {}),
        ...(typeof event.tool_name === "string" ? { tool_name: event.tool_name } : {}),
      };

    case "PauseEvent":
    case "InterruptEvent":
      return base;

    case "UserRejectObservation":
      return {
        ...base,
        ...(typeof event.rejection_reason === "string"
          ? { rejection_reason: event.rejection_reason }
          : {}),
        ...(event.rejection_source === "user" || event.rejection_source === "hook"
          ? { rejection_source: event.rejection_source }
          : {}),
        ...(typeof event.action_id === "string" ? { action_id: event.action_id } : {}),
        ...(typeof event.tool_name === "string" ? { tool_name: event.tool_name } : {}),
      };

    case "HookExecutionEvent":
      return {
        ...base,
        ...(typeof event.hook_event_type === "string"
          ? { hook_event_type: event.hook_event_type }
          : {}),
        ...(typeof event.tool_name === "string" ? { tool_name: event.tool_name } : {}),
        ...(typeof event.success === "boolean" ? { success: event.success } : {}),
        ...(typeof event.blocked === "boolean" ? { blocked: event.blocked } : {}),
        ...(typeof event.exit_code === "number" ? { exit_code: event.exit_code } : {}),
        ...(typeof event.reason === "string" ? { reason: event.reason } : {}),
        ...(typeof event.error === "string" ? { error: event.error } : {}),
      };

    default:
      return null;
  }
}
