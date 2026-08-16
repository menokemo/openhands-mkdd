export type DetectedPreviewLink =
  | { kind: "preview"; url: string; projectSlug: string; filePath: string }
  | { kind: "live-port"; port: number; path: string };

// Matches our own /preview/{project}/{path} links (server/routes/preview.mjs
// - static files, served from MKDD's own origin) and /live-port/{port}/{path}
// markers (BUGS_AND_FIXES.md #56 - a project's own dedicated live-app port,
// reached directly rather than through a subpath, so its own absolute
// paths never break). Deliberately only matches these two OWN link
// shapes, not arbitrary external URLs - rendering a card/iframe for any
// random link a message happens to contain would be a real security/
// privacy risk (leaking the visitor's IP/cookies to third parties, or
// embedding unexpected content).
const PREVIEW_PATTERN =
  /(?:https?:\/\/[^/\s]+)?\/preview\/([a-z0-9-]+)(?:\/([^\s)"'<>]*))?/gi;
const LIVE_PORT_PATTERN = /\/live-port\/(\d+)(?:\/([^\s)"'<>]*))?/gi;

/**
 * Strips trailing sentence punctuation a human would naturally type
 * right after a pasted link (e.g. "...palette.html." at the end of a
 * sentence) - without this, a captured path would include the period
 * and never resolve to the real file/route.
 */
function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,!?;:]+$/, "");
}

/**
 * Finds every /preview/{project}/{path} and /live-port/{port}/{path}
 * link in a block of message text. Returns an empty array if none are
 * present - callers should treat that as "nothing special to render",
 * not an error.
 */
export function detectPreviewLinks(text: string): DetectedPreviewLink[] {
  const results: DetectedPreviewLink[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PREVIEW_PATTERN)) {
    const [, projectSlug, rawFilePath] = match;
    if (!projectSlug) continue;

    const filePath = stripTrailingPunctuation(rawFilePath ?? "");
    const key = `preview/${projectSlug}/${filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      kind: "preview",
      url: `/preview/${projectSlug}/${filePath}`,
      projectSlug,
      filePath,
    });
  }

  for (const match of text.matchAll(LIVE_PORT_PATTERN)) {
    const [, rawPort, rawPath] = match;
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0) continue;

    const path = stripTrailingPunctuation(rawPath ?? "");
    const key = `live-port/${port}/${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ kind: "live-port", port, path });
  }

  return results;
}
