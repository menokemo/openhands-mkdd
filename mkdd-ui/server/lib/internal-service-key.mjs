import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// /projects is the one directory genuinely mounted read-write into
// BOTH the mkdd-ui and agent-canvas containers (both reference the
// same ${MKDD_PROJECTS_DIR:-./projects} host path in compose.yml) -
// making it the natural shared location for a value that mkdd-ui
// generates but employees (running inside agent-canvas) need to read
// (BUGS_AND_FIXES.md #135). A hidden subdirectory keeps it clearly
// separate from actual project repositories living alongside it.
const KEY_DIR = "/projects/.mkdd-internal";
const KEY_FILE = path.join(KEY_DIR, "service-key.txt");

/**
 * Returns the internal service key employees use to authenticate their
 * workflow API calls (BUGS_AND_FIXES.md #134/#135) - auto-generating
 * and persisting a new random one on first call if none exists yet, so
 * the owner never has to manually configure a secret. Stable after
 * that (read from disk on every subsequent call, not regenerated),
 * matching what AGENTS.md tells employees to read via
 * `$(cat /projects/.mkdd-internal/service-key.txt)`.
 */
export function getInternalServiceKey() {
  try {
    return fs.readFileSync(KEY_FILE, "utf-8").trim();
  } catch {
    // File doesn't exist yet - generate and persist a new one.
  }

  // Rare edge case, noted rather than silently ignored: if two
  // requests truly race on the very first-ever call (before the file
  // exists), both could generate different values and the second
  // write wins. This can only happen once, ever, on a fresh
  // deployment's first workflow request, and self-resolves (whichever
  // value ends up on disk becomes the stable one from then on; the one
  // request that lost the race simply fails once and is retried by the
  // employee's next call) - not worth a more complex locking mechanism
  // for this narrow a window.
  const key = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(KEY_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, key);
  return key;
}
