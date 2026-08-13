/**
 * Live time-awareness for employees (BUGS_AND_FIXES.md #25).
 *
 * Per ENGINEERING_PRINCIPLES.md #1, this was only built after confirming
 * no existing OpenHands mechanism already solves it: the bundled
 * documentation (docs/architecture.md, docs/SELF_HOSTING.md, etc.) and a
 * live check of a real conversation's settings contain no date/time
 * awareness feature. The closest related mechanism found,
 * `system_message_suffix` / `agent_context` (docs/architecture.md,
 * "Runtime services" section), is STATIC content set once per Agent
 * Profile — it cannot carry a live, per-turn timestamp.
 *
 * The guaranteed fix: inject the real current time into every message
 * relayed to OpenHands, as a marker line the employee is instructed
 * (via bootstrap-employees.mjs's system_message_suffix addendum) to read
 * silently and never repeat back to the user. The marker is stripped
 * back out before the browser ever sees it (see normalize-event.mjs),
 * so the user only ever sees their own original text, on both the REST
 * and WebSocket transports (both share the same normalizer, per Phase A).
 */

const MARKER_PREFIX = "<!--mkdd:time:";
const MARKER_SUFFIX = "-->";
const MARKER_LINE_REGEX = /^<!--mkdd:time:[^>]*-->\n?/;

/** Instruction text every employee's system prompt gets, once (see bootstrap-employees.mjs). */
export const TIME_CONTEXT_INSTRUCTIONS = `## Live Time Context

Each user message may begin with a hidden system line in the exact form:
<!--mkdd:time:ISO_8601_TIMESTAMP-->

This line states the real current date and time when the user sent that
specific message. Use it to reason accurately about elapsed time, "today",
"this week", recency, and scheduling - never assume your own training
cutoff or an earlier message's timestamp represents "now". Do not quote,
repeat, or mention this line to the user; it is a system-only marker that
has already been removed from what they see.`;

/** Prepends the current-time marker to an outgoing message. */
export function withTimeContext(text) {
  const now = new Date().toISOString();
  return `${MARKER_PREFIX}${now}${MARKER_SUFFIX}\n${text}`;
}

/** Removes the marker line from an incoming (echoed-back) message, if present. */
export function stripTimeContext(text) {
  return text.replace(MARKER_LINE_REGEX, "");
}
