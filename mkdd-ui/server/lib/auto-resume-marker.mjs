/**
 * Hidden-marker mechanism for the auto-resume message (#175), so it
 * reaches the employee (needed to actually trigger resumed work) but
 * never appears as a normal-looking chat bubble in MKDD's own
 * conversation view (BUGS_AND_FIXES.md #176 - the owner explicitly
 * asked for this to not clutter the chat, and instead surface in the
 * employee's own insights panel).
 *
 * Follows the exact same pattern as time-context.mjs's existing hidden
 * marker: a marker line that OpenHands (and the browser) both receive,
 * but normalize-event.mjs filters the whole message out of what the
 * browser ever sees (not just a partial strip, since the message
 * itself is entirely system-generated, not real owner-authored text).
 */

const MARKER_LINE = "<!--mkdd:auto-resume-->";

/** Prepends the auto-resume marker to an outgoing resume message. */
export function withAutoResumeMarker(text) {
  return `${MARKER_LINE}\n${text}`;
}

/** True if a message's first line carries the auto-resume marker. */
export function isAutoResumeMessage(text) {
  return typeof text === "string" && text.startsWith(MARKER_LINE);
}
