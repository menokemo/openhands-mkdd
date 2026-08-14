import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openhandsFetch } from "../lib/openhands-client.mjs";
import {
  ALLOWED_COLORS,
  DEFAULT_PROJECT_COLOR,
  setProjectColor,
} from "../lib/project-metadata.mjs";

/**
 * Base directory (inside this container) where new project folders are
 * created. Must be the SAME container path OpenHands Agent Canvas mounts
 * its own /projects volume to, since the workspace `path` registered with
 * OpenHands (see below) must resolve to a real, existing directory from
 * OpenHands' own point of view.
 */
const PROJECTS_DIR = "/projects";

/**
 * A conservative slug: lowercase letters, digits, and hyphens only, must
 * start with a letter or digit. Rejects path traversal (`..`, `/`) and any
 * character that could be meaningful to the filesystem or shell.
 */
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function slugifyProjectName(rawName) {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

/**
 * POST /api/projects — creates a new project.
 *
 * Per ENGINEERING_PRINCIPLES.md #1 ("every mkdd-ui feature must have a real
 * basis in openhands-agent-canvas"): this mirrors the real mechanism used
 * by Agent Canvas's own "add workspace" flow
 * (src/components/features/home/workspace-dropdown/folder-browser-modal.tsx
 * -> handleAddDirectory), which registers a folder via
 * `POST /api/workspaces` with `{id: path, name, path}` where `id` and
 * `path` are the same value. Confirmed against the live agent-server's
 * openapi.json (`/api/workspaces -> ['get', 'post', 'delete']`) before
 * implementing, per the same principle.
 *
 * The difference from Agent Canvas's own flow: Agent Canvas lets a human
 * browse to an EXISTING folder. MKDD's "new project" button has no
 * existing folder to browse to, so this route creates an empty directory
 * first, then registers it exactly the same way Agent Canvas would.
 */
export async function handleCreateProject(req, res) {
  if (!(req.method === "POST" && req.url === "/api/projects")) return false;

  const { name, color } = await readJsonBody(req);

  if (typeof name !== "string" || !name.trim()) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "name_required" }));
    return true;
  }

  const projectColor =
    typeof color === "string" && ALLOWED_COLORS.includes(color)
      ? color
      : DEFAULT_PROJECT_COLOR;

  const slug = slugifyProjectName(name) || `project-${randomUUID().slice(0, 8)}`;

  if (!VALID_SLUG.test(slug)) {
    // Only reachable if the fallback itself is somehow malformed, which
    // shouldn't happen given randomUUID()'s output shape - kept as a
    // defensive guard rather than a realistic user-facing path.
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_project_name" }));
    return true;
  }

  const projectPath = path.join(PROJECTS_DIR, slug);

  if (fs.existsSync(projectPath)) {
    res.writeHead(409, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_already_exists" }));
    return true;
  }

  fs.mkdirSync(projectPath, { recursive: true });
  // mkdirSync's `mode` option is still reduced by the process umask, so it
  // can't reliably guarantee write access - chmod explicitly instead.
  // Without this, the OpenHands agent-server's non-root "openhands" user
  // cannot write files into a project this container (running as root)
  // just created, since ownership/permissions default to whoever created
  // the directory (see BUGS_AND_FIXES.md #36 - this was reported live:
  // an employee could be assigned work but couldn't create project
  // files). The directory only ever holds project workspace files, never
  // credentials, so 777 is an acceptable trade-off here.
  fs.chmodSync(projectPath, 0o777);

  // The agent-server expects {"workspaces": [...]}, not a bare array -
  // confirmed via the live openapi.json's AddWorkspacesRequest schema
  // (an initial guess without this envelope failed with a real 422:
  // "Input should be a valid dictionary or object to extract fields from").
  let r;
  try {
    r = await openhandsFetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaces: [{ id: projectPath, name: name.trim(), path: projectPath }],
      }),
    });
  } catch (e) {
    // A total network failure (OpenHands unreachable) throws rather than
    // resolving with a non-ok response - without this catch, the rollback
    // below would never run and an orphaned, unregistered directory would
    // be left behind. Found and fixed live while testing BUGS_AND_FIXES.md
    // #36's permission fix.
    fs.rmSync(projectPath, { recursive: true, force: true });
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: "workspace_registration_failed", detail: e.message }),
    );
    return true;
  }

  if (!r.ok) {
    // Roll back the directory we just created so a failed registration
    // doesn't leave an orphaned, unregistered folder behind.
    fs.rmSync(projectPath, { recursive: true, force: true });
    const errorBody = await r.text();
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: "workspace_registration_failed", detail: errorBody }),
    );
    return true;
  }

  setProjectColor(projectPath, projectColor);

  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      project: {
        id: projectPath,
        name: name.trim(),
        path: projectPath,
        color: projectColor,
      },
    }),
  );
  return true;
}
