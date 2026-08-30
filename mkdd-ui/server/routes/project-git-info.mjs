import fs from "node:fs";
import path from "node:path";
import { openhands } from "../lib/openhands-client.mjs";

/**
 * GET /api/projects/git-info?project=/projects/xyz — repo name, recent
 * commits, and clean/dirty status for a project's home page
 * (BUGS_AND_FIXES.md #166), discussed at length with the owner and
 * built strictly on real data:
 *
 * - Repo name: read directly from the local .git/config file's
 *   [remote "origin"] url - mkdd-ui already mounts the same /projects
 *   volume agent-canvas uses, so this is a plain local file read, the
 *   same source of truth git itself uses.
 * - Recent commits + clean/dirty status: OpenHands' own /api/git/commits
 *   and /api/git/changes endpoints - real local git history, no
 *   fabrication.
 *
 * Deliberately does NOT call the real GitHub API for live PR status -
 * live investigation confirmed OpenHands' open-source, self-hosted
 * agent-server has no endpoint for this (GitHub's official docs place
 * deep PR/webhook integration under OpenHands Cloud specifically, not
 * the open-source product this deployment runs). Adding a separate
 * GitHub API call here would mean a feature with no real basis in
 * OpenHands - directly against ENGINEERING_PRINCIPLES.md #1 - so this
 * endpoint stays limited to what's genuinely available.
 */
export async function handleProjectGitInfo(req, res) {
  if (!(req.method === "GET" && req.url?.startsWith("/api/projects/git-info"))) {
    return false;
  }

  const url = new URL(req.url, "http://mkdd.local");
  const project = url.searchParams.get("project");
  const requestedLimit = Number(url.searchParams.get("limit"));
  // OpenHands' own /api/git/commits caps at 200 (no true pagination
  // beyond that - just a higher single-request limit) - clamp to that
  // real ceiling rather than silently passing through an invalid value.
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 200)
      : 10;

  if (!project) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_required" }));
    return true;
  }

  const repoUrl = readRepoUrl(project);

  const [commitsResult, changesResult] = await Promise.allSettled([
    fetchCommits(project, limit),
    fetchChangesCount(project),
  ]);

  const commits = commitsResult.status === "fulfilled" ? commitsResult.value : [];
  const uncommittedChanges =
    changesResult.status === "fulfilled" ? changesResult.value : null;

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      repoUrl,
      commits,
      uncommittedChanges,
    }),
  );
  return true;
}

/**
 * Reads the remote origin URL directly from .git/config - the same
 * file git itself treats as the source of truth. Returns null (not an
 * error) if the project isn't a git repo yet, or has no remote
 * configured - both are legitimate, common states, not failures.
 */
function readRepoUrl(projectPath) {
  const configPath = path.join(projectPath, ".git", "config");

  let content;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }

  const match = content.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
  return match ? match[1] : null;
}

async function fetchCommits(projectPath, limit) {
  const qs = new URLSearchParams({ path: projectPath, limit: String(limit) });
  const r = await openhands(`/api/git/commits?${qs}`);
  if (!r.ok) return [];
  const data = await r.json();
  return data.commits ?? [];
}

async function fetchChangesCount(projectPath) {
  const qs = new URLSearchParams({ path: projectPath });
  const r = await openhands(`/api/git/changes?${qs}`);
  if (!r.ok) return null;
  const data = await r.json();
  return Array.isArray(data) ? data.length : null;
}
