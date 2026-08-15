import path from "node:path";

export const PROJECTS_DIR = "/projects";

/**
 * Resolves a project slug to its absolute directory, guaranteed to be a
 * genuine direct child of PROJECTS_DIR. Returns null for an empty slug
 * or one that would resolve outside PROJECTS_DIR (e.g. "..").
 *
 * Shared by server/routes/preview.mjs and server/routes/project-files.mjs
 * so this security-relevant check has exactly one implementation, not
 * two independently-maintained copies.
 */
export function resolveProjectDir(projectSlug, projectsDir = PROJECTS_DIR) {
  if (!projectSlug) return null;

  const projectsDirWithSep = projectsDir.endsWith(path.sep)
    ? projectsDir
    : projectsDir + path.sep;
  const projectDir = path.join(projectsDir, projectSlug);

  if (!projectDir.startsWith(projectsDirWithSep)) return null;

  return projectDir;
}
