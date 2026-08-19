import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Serves the production frontend build (BUGS_AND_FIXES.md #123).
 * Previously the app ran entirely via Vite's DEV server (unbundled ES
 * modules - a real page load could mean dozens/hundreds of separate
 * file requests, unlike a bundled production build), which was the
 * actual cause of noticeable slowness on every page open, even over a
 * fast local network. This serves the real `vite build` output
 * instead: bundled, minified, few files.
 *
 * Tried LAST, after every API route - only ever reached for a genuine
 * static asset or the app shell itself.
 *
 * Falls back to index.html for anything that isn't an actual file in
 * dist/ (including the root `/`) - safe to do unconditionally here
 * because this app's routing is entirely query-string based
 * (?project=...&employee=...), never path-based, so there are no
 * "real" sub-paths a static 404 could ever legitimately apply to
 * (confirmed in useProjectNavigation.ts).
 */
export async function handleStaticFiles(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!fs.existsSync(DIST_DIR)) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const requestedPath = decodeURIComponent(url.pathname);

  // Resolve against DIST_DIR and verify the result is still inside it -
  // prevents a path like /../../etc/passwd from escaping the dist
  // directory via path traversal.
  const resolved = path.resolve(DIST_DIR, "." + requestedPath);
  const isInsideDist = resolved === DIST_DIR || resolved.startsWith(DIST_DIR + path.sep);

  const filePath =
    isInsideDist &&
    requestedPath !== "/" &&
    fs.existsSync(resolved) &&
    fs.statSync(resolved).isFile()
      ? resolved
      : path.join(DIST_DIR, "index.html");

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "content-type": contentTypeFor(filePath) });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  }
  return true;
}
