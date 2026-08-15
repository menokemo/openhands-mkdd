import fs from "node:fs";
import path from "node:path";
import { resolveProjectDir } from "../lib/project-paths.mjs";

// Directories that never belong in the listing an owner would want to
// see (build artifacts, VCS internals, dependency caches) - noise, not
// signal, and in node_modules' case potentially tens of thousands of
// entries that would make the response enormous for no benefit.
const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "dist",
  "build",
]);

/**
 * Recursively lists every file and directory inside a project, relative
 * to the project's own root. Depth-limited defensively (50 levels) - a
 * real project should never need to go deeper, and this prevents a
 * pathological symlink loop or similar from hanging the request.
 */
export function walk(dir, base, depth = 0) {
  if (depth > 50) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    if (IGNORED_NAMES.has(entry.name)) continue;

    const relPath = base ? `${base}/${entry.name}` : entry.name;
    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push({ path: relPath, type: "directory" });
      results.push(...walk(absPath, relPath, depth + 1));
    } else if (entry.isFile()) {
      const stat = fs.statSync(absPath);
      results.push({ path: relPath, type: "file", size: stat.size });
    }
  }

  return results;
}

/**
 * GET /api/projects/{projectSlug}/files — lists every real file and
 * folder inside a project (README section 47's "display only real data"
 * principle: this is a live directory listing, not a fabricated project
 * structure). Built on the same /projects mount and the same
 * path-safety helper as server/routes/preview.mjs (BUGS_AND_FIXES.md
 * #41), so files an employee actually creates become visible on Project
 * Home instead of only reachable by knowing the exact preview URL.
 */
export async function handleProjectFiles(req, res) {
  const match = req.url?.match(/^\/api\/projects\/([^/]+)\/files$/);
  if (!(req.method === "GET" && match)) return false;

  const projectSlug = decodeURIComponent(match[1]);
  const projectDir = resolveProjectDir(projectSlug);

  if (!projectDir) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_project" }));
    return true;
  }

  if (!fs.existsSync(projectDir)) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ files: [] }));
    return true;
  }

  const files = walk(projectDir, "").sort((a, b) => a.path.localeCompare(b.path));

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ files }));
  return true;
}
