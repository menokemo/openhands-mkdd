/**
 * Marker for report-delivery messages (BUGS_AND_FIXES.md #197) - unlike
 * the auto-resume marker (which hides its message entirely from the
 * chat, see auto-resume-marker.mjs), this one keeps the message's real
 * content reachable but tags it so the frontend can render it as a
 * compact badge/button instead of a full chat bubble, opening a popup
 * with the real content on tap. The owner explicitly wants report
 * content visible on demand, just not cluttering the main conversation
 * flow as a normal-looking bubble.
 */

const MARKER_LINE = "<!--mkdd:report-delivery-->";

/** Prepends the report-delivery marker to an outgoing report message. */
export function withReportMarker(text) {
  return `${MARKER_LINE}\n${text}`;
}

/** True if a message's first line carries the report-delivery marker. */
export function isReportMessage(text) {
  return typeof text === "string" && text.startsWith(MARKER_LINE);
}

/** Strips the report-delivery marker line, leaving the real message content. */
export function stripReportMarker(text) {
  return typeof text === "string" ? text.replace(`${MARKER_LINE}\n`, "") : text;
}
