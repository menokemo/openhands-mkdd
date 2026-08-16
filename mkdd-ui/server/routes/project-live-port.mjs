import fs from "node:fs";
import { resolveProjectDir } from "../lib/project-paths.mjs";
import { getOrAssignLivePort } from "../lib/live-port-registry.mjs";

/**
 * GET /api/projects/{projectSlug}/live-port - returns the port an
 * employee should bind their project's live server to (assigning it on
 * first request, permanently, via server/lib/live-port-registry.mjs).
 * Employees query this instead of guessing/hardcoding a port, and the
 * frontend uses the same endpoint to build the actual URL it shows the
 * owner (see src/api/client.ts's fetchProjectLivePort).
 */
export async function handleProjectLivePort(req, res) {
  const match = req.url?.match(/^\/api\/projects\/([^/]+)\/live-port$/);
  if (!(req.method === "GET" && match)) return false;

  const projectSlug = decodeURIComponent(match[1]);
  const projectDir = resolveProjectDir(projectSlug);

  if (!projectDir || !fs.existsSync(projectDir)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown_project" }));
    return true;
  }

  try {
    const port = getOrAssignLivePort(projectSlug);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ port }));
  } catch (error) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }

  return true;
}
