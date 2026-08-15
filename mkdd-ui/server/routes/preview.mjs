import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveProjectDir } from "../lib/project-paths.mjs";

const CONTENT_TYPE_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Static file preview for anything an employee creates inside a project
 * (e.g. a static HTML/CSS/JS prototype). Grounded in real, already-existing
 * infrastructure - the /projects directory is already bind-mounted into
 * both the agent-canvas and mkdd-ui containers - rather than depending on
 * an employee-started ad-hoc dev server, whose port is never actually
 * exposed outside the agent's own container network namespace (confirmed
 * from the real openhands-agent-canvas source: its "runtime_services"
 * mechanism only covers a small fixed set of pre-configured services -
 * agent_server/ingress/frontend/automation - not arbitrary ports an agent
 * happens to bind itself).
 *
 * URL shape: /preview/{projectSlug}/{...file path}
 * Directory requests fall back to index.html if present, matching how a
 * static prototype's internal links (e.g. <a href="about.html">) are
 * normally written relative to a folder root.
 */
/**
 * Resolves a requested preview path to an absolute file path, guaranteed
 * to stay inside that project's own directory. Returns null if the
 * request doesn't name a project, or if the resolved path would escape
 * the project directory (path traversal attempt) - callers should treat
 * null the same as "reject this request", without needing to know why.
 *
 * Exported separately from the route handler so this security-critical
 * logic can be unit-tested without needing a real HTTP request/response
 * or real files on disk.
 */
export function resolvePreviewFile(rawPath, projectsDir = PROJECTS_DIR) {
  const [projectSlug, ...restParts] = rawPath.split("/");
  const projectDir = resolveProjectDir(projectSlug, projectsDir);
  if (!projectDir) return null;

  const projectDirWithSep = projectDir.endsWith(path.sep)
    ? projectDir
    : projectDir + path.sep;

  let requestedPath = restParts.join("/") || "index.html";
  if (requestedPath.endsWith("/")) requestedPath += "index.html";

  const resolvedFile = path.join(projectDir, requestedPath);
  if (!resolvedFile.startsWith(projectDirWithSep)) return null;

  return resolvedFile;
}

export async function handlePreview(req, res) {
  if (!(req.method === "GET" && req.url?.startsWith("/preview/"))) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const rawPath = decodeURIComponent(url.pathname.slice("/preview/".length));

  const resolvedFile = resolvePreviewFile(rawPath);

  if (!resolvedFile) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "path_outside_project" }));
    return true;
  }

  if (!fs.existsSync(resolvedFile) || fs.statSync(resolvedFile).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return true;
  }

  const ext = path.extname(resolvedFile).toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";

  res.writeHead(200, { "content-type": contentType });
  fs.createReadStream(resolvedFile).pipe(res);
  return true;
}
