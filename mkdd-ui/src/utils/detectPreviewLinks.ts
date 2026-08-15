export type DetectedPreviewLink = {
  url: string;
  kind: "preview" | "live";
  projectSlug: string;
  filePath: string;
};

// Matches an absolute /preview/{project}/{path} or /live/{project}/{path}
// URL, whether written as a bare relative path or a full origin URL
// pointing at this same app (an employee might paste either form).
// Deliberately only matches OUR OWN links (server/routes/preview.mjs and
// server/routes/live-proxy.mjs), not arbitrary external URLs - rendering
// a card/iframe for any random link a message happens to contain would
// be a real security/privacy risk (leaking the visitor's IP/cookies to
// third parties, or embedding unexpected content).
const LINK_PATTERN =
  /(?:https?:\/\/[^/\s]+)?\/(preview|live)\/([a-z0-9-]+)(?:\/([^\s)"'<>]*))?/gi;

/**
 * Finds every /preview/{project}/{path} or /live/{project}/{path} link
 * in a block of message text. Returns an empty array if none are
 * present - callers should treat that as "nothing special to render",
 * not an error.
 */
export function detectPreviewLinks(text: string): DetectedPreviewLink[] {
  const results: DetectedPreviewLink[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(LINK_PATTERN)) {
    const [, rawKind, projectSlug, rawFilePath] = match;
    if (!projectSlug) continue;
    const kind = rawKind === "live" ? "live" : "preview";

    // Strip trailing sentence punctuation a human would naturally type
    // right after a pasted link (e.g. "...palette.html." at the end of
    // a sentence) - without this, the captured path would include the
    // period and never resolve to a real file. A bare root link (no
    // path segment at all, e.g. "/live/acme-app/") is valid too - most
    // live-app links are exactly this.
    const filePath = (rawFilePath ?? "").replace(/[.,!?;:]+$/, "");

    const key = `${kind}/${projectSlug}/${filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      url: `/${kind}/${projectSlug}/${filePath}`,
      kind,
      projectSlug,
      filePath,
    });
  }

  return results;
}
