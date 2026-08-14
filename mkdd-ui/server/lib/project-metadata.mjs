import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const STATE_FILE = path.join(STATE_DIR, "project-metadata.json");

/**
 * Project cover colors (README section 47's "no fabricated data" principle
 * doesn't apply here - the color IS the real data the user chose, just
 * stored by MKDD itself rather than OpenHands, since OpenHands' Workspace
 * concept ({id, name, path}) has no color field. Mirrors the same atomic
 * read/write JSON pattern as workflow-state.mjs.
 */
const ALLOWED_COLORS = ["#7c6bff", "#5c9eff", "#3ecf8e", "#f5a524", "#f5618b", "#8d95aa"];

export const DEFAULT_PROJECT_COLOR = ALLOWED_COLORS[0];

function readStore() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : { projects: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { projects: {} };
    throw error;
  }
}

function writeStore(store) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
  fs.renameSync(temp, STATE_FILE);
}

export function getProjectColor(projectPath) {
  const store = readStore();
  return store.projects?.[projectPath]?.color ?? DEFAULT_PROJECT_COLOR;
}

export function setProjectColor(projectPath, color) {
  if (!ALLOWED_COLORS.includes(color)) {
    throw new Error("invalid_project_color");
  }

  const store = readStore();
  if (!store.projects || typeof store.projects !== "object") {
    store.projects = {};
  }

  store.projects[projectPath] = { color };
  writeStore(store);
  return color;
}

export { ALLOWED_COLORS };
