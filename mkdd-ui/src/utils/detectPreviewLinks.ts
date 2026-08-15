export type DetectedPreviewLink = {
  url: string;
  projectSlug: string;
  filePath: string;
};

// Matches an absolute /preview/{project}/{path} URL, whether written as
// a bare relative path or a full origin URL pointing at this same app
// (an employee might paste either form). Deliberately only matches OUR
// OWN preview links (server/routes/preview.mjs), not arbitrary external
// URLs - rendering an iframe for any random link a message happens to
// contain would be a real security/privacy risk (leaking the visitor's
// IP/cookies to third parties, or embedding unexpected content).
const PREVIEW_LINK_PATTERN =
  /(?:https?:\/\/[^/\s]+)?\/preview\/([a-z0-9-]+)\/([^\s)"'<>]+)/gi;

/**
 * Finds every /preview/{project}/{path} link in a block of message text.
 * Returns an empty array if none are present - callers should treat that
 * as "nothing special to render", not an error.
 */
export function detectPreviewLinks(text: string): DetectedPreviewLink[] {
  const results: DetectedPreviewLink[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PREVIEW_LINK_PATTERN)) {
    const [, projectSlug, rawFilePath] = match;
    if (!projectSlug || !rawFilePath) continue;

    // Strip trailing sentence punctuation a human would naturally type
    // right after a pasted link (e.g. "...palette.html." at the end of
    // a sentence) - without this, the captured path would include the
    // period and never resolve to a real file.
    const filePath = rawFilePath.replace(/[.,!?;:]+$/, "");
    if (!filePath) continue;

    const key = `${projectSlug}/${filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      url: `/preview/${projectSlug}/${filePath}`,
      projectSlug,
      filePath,
    });
  }

  return results;
}
