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
import { isAutoResumeMessage } from "./auto-resume-marker.mjs";
import { isReportMessage, stripReportMarker } from "./report-message-marker.mjs";

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
 * Like textContent, but also preserves image content items (real shape
 * confirmed from openhands-agent-canvas's own MessageImageContent type:
 * {type:"image", image_urls: string[]}). Used specifically for chat
 * MessageEvent content, since users/employees can now attach images
 * (BUGS_AND_FIXES.md #43) - kept separate from textContent, which stays
 * text-only for tool/observation output, where we deliberately don't
 * forward arbitrary internal image blobs.
 */
export function messageContent(content) {
  if (typeof content === "string") {
    return content.trim() ? [{ type: "text", text: content }] : [];
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (item) =>
          item &&
          ((item.type === "text" && typeof item.text === "string") ||
            (item.type === "image" && Array.isArray(item.image_urls))),
      )
      .map((item) =>
        item.type === "text"
          ? { type: "text", text: item.text }
          : {
              type: "image",
              image_urls: item.image_urls.filter((u) => typeof u === "string"),
            },
      );
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
      const content = messageContent(event.llm_message?.content);

      // BUGS_AND_FIXES.md #176: the auto-resume system's message is
      // entirely system-generated (not real owner-authored text) - the
      // owner explicitly asked for it to never show up as a normal
      // chat bubble, only surface in the employee's insights panel
      // instead. Unlike the time-context marker below (which just gets
      // stripped from an otherwise-real message), this whole event
      // must be filtered out - returning null here, which every call
      // site already does `.filter(Boolean)` on (REST x3 and the
      // WebSocket bridge), so one change here covers every transport.
      // Checked AFTER stripping the time-context marker: every
      // outgoing message (including this one) gets that marker
      // prepended automatically by buildOutgoingContent, so the raw
      // text is "<!--mkdd:time:...-->\n<!--mkdd:auto-resume-->\n...",
      // not the auto-resume marker at position 0.
      const firstItemText =
        base.source === "user" && content[0]?.type === "text"
          ? stripTimeContext(content[0].text)
          : null;
      if (firstItemText && isAutoResumeMessage(firstItemText)) {
        return null;
      }

      // Only user messages ever carry the time-context marker (see
      // server/lib/time-context.mjs) - strip it here so neither transport
      // (REST or WebSocket, both routed through this same function) ever
      // shows it to the browser. It's only injected on the first content
      // item, and only when that item is text (an attached image can be
      // the first item too, per BUGS_AND_FIXES.md #43).
      const cleaned =
        base.source === "user"
          ? content.map((item, i) =>
              i === 0 && item.type === "text"
                ? { ...item, text: stripTimeContext(item.text) }
                : item,
            )
          : content;

      // BUGS_AND_FIXES.md #197: a report-delivery message stays real
      // content (unlike the auto-resume marker above, which hides its
      // message entirely) - the owner wants to see report content on
      // demand, just not as a normal-looking chat bubble cluttering the
      // conversation. Tag it here (after the time-context marker is
      // already stripped) so the frontend can render it as a compact
      // badge that opens a popup with the real text, instead of a full
      // bubble.
      const firstCleanedText =
        base.source === "user" && cleaned[0]?.type === "text" ? cleaned[0].text : null;
      const isReportDelivery = Boolean(
        firstCleanedText && isReportMessage(firstCleanedText),
      );
      const finalContent = isReportDelivery
        ? cleaned.map((item, i) =>
            i === 0 && item.type === "text"
              ? { ...item, text: stripReportMarker(item.text) }
              : item,
          )
        : cleaned;

      return {
        ...base,
        llm_message: { content: finalContent },
        ...(isReportDelivery ? { isReportDelivery: true } : {}),
      };
    }

    case "ActionEvent": {
      // BUGS_AND_FIXES.md #182: an employee's final delivery message is
      // sent via the "finish" tool (ActionEvent, tool_name "finish",
      // action.kind "FinishAction", real text in action.message) - NOT
      // a regular MessageEvent. Discovered via direct live
      // investigation with the owner: a genuine, substantial final
      // delivery message (links, credentials, verification summary)
      // was completely invisible in MKDD's chat view because
      // splitEvents only ever checked kind === "MessageEvent", so this
      // - the single most important message in the whole conversation
      // - was silently misclassified as internal Activity noise.
      // Translating it into the standard MessageEvent shape here means
      // it flows through every existing message-handling code path
      // automatically (mergeById, the chat view, etc.) with zero
      // changes needed anywhere else.
      if (event.tool_name === "finish" && typeof event.action?.message === "string") {
        return {
          ...base,
          kind: "MessageEvent",
          llm_message: { content: [{ type: "text", text: event.action.message }] },
        };
      }

      return {
        ...base,
        ...(typeof event.summary === "string" ? { summary: event.summary } : {}),
        ...(typeof event.tool_name === "string" ? { tool_name: event.tool_name } : {}),
      };
    }

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
