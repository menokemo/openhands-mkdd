import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const STATE_FILE = path.join(STATE_DIR, "auto-resume-log.json");
const MAX_ENTRIES_PER_KEY = 50;

function readStore() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : { entries: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { entries: {} };
    throw error;
  }
}

function writeStore(store) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
  fs.renameSync(temp, STATE_FILE);
}

function keyFor(project, employeeId) {
  return `${project}::${employeeId}`;
}

/** Appends a new auto-resume event, capped at MAX_ENTRIES_PER_KEY (oldest dropped first). */
export function appendAutoResumeLogEntry({ project, employeeId, employeeName }) {
  const store = readStore();
  if (!store.entries || typeof store.entries !== "object") {
    store.entries = {};
  }

  const key = keyFor(project, employeeId);
  const existing = Array.isArray(store.entries[key]) ? store.entries[key] : [];
  const updated = [...existing, { at: new Date().toISOString(), employeeName }].slice(
    -MAX_ENTRIES_PER_KEY,
  );

  store.entries[key] = updated;
  writeStore(store);
}

/** Reads the auto-resume log for one project+employee, most recent first. */
export function getAutoResumeLog(project, employeeId) {
  const store = readStore();
  const entries = store.entries?.[keyFor(project, employeeId)] ?? [];
  return [...entries].reverse();
}
