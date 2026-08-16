import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const STATE_FILE = path.join(STATE_DIR, "live-port-registry.json");

// BUGS_AND_FIXES.md #56: a shared single port (4001) proxied via a
// rewritten subpath (/live/{project}/...) required rewriting every
// absolute path a target app might use - a genuinely unbounded set of
// possible framework conventions, confirmed live to be an ongoing
// chase (asset paths, then API paths, discovered incrementally). This
// registry backs a fundamentally different, robust design instead: each
// project gets its OWN dedicated port from a reserved range, forwarded
// via a raw byte-for-byte TCP pass-through (server/live-port-proxy.mjs)
// with zero content rewriting - since the app is reached at what looks
// exactly like its own root, no absolute path can ever "escape" it.
export const LIVE_PORT_RANGE_START = 4001;
export const LIVE_PORT_RANGE_SIZE = 20;

function readStore() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : { assignments: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { assignments: {} };
    throw error;
  }
}

function writeStore(store) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
  fs.renameSync(temp, STATE_FILE);
}

/**
 * Returns this project's already-assigned live-preview port, or assigns
 * it the first free port in the reserved range and persists that
 * assignment permanently - the same project always gets the same port
 * again later, rather than being re-picked (which could otherwise
 * silently reassign a port a project's own scripts/bookmarks already
 * depend on).
 *
 * Throws if every port in the range is already assigned to some OTHER
 * project - callers should surface this as a clear error, not a
 * fabricated port number.
 */
export function getOrAssignLivePort(projectSlug) {
  const store = readStore();
  if (!store.assignments || typeof store.assignments !== "object") {
    store.assignments = {};
  }

  const existing = store.assignments[projectSlug];
  if (typeof existing === "number") return existing;

  const usedPorts = new Set(Object.values(store.assignments));
  for (let i = 0; i < LIVE_PORT_RANGE_SIZE; i++) {
    const candidate = LIVE_PORT_RANGE_START + i;
    if (!usedPorts.has(candidate)) {
      store.assignments[projectSlug] = candidate;
      writeStore(store);
      return candidate;
    }
  }

  throw new Error("live_port_range_exhausted");
}

/**
 * Looks up which project (if any) currently owns a given port -
 * read-only, does not assign anything. Used so a project can be told
 * "you don't own this port" without side effects.
 */
export function findProjectForLivePort(port) {
  const store = readStore();
  const entry = Object.entries(store.assignments ?? {}).find(([, p]) => p === port);
  return entry ? entry[0] : null;
}
