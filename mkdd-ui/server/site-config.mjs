import fs from "node:fs";
import path from "node:path";

// Same persistence directory as workflow-state.mjs/push-state.mjs
// (BUGS_AND_FIXES.md #109) - the domain the owner sets from the UI
// lives here, not in source code.
const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const CONFIG_FILE = path.join(STATE_DIR, "site-config.json");

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { allowedHosts: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      allowedHosts: Array.isArray(parsed.allowedHosts) ? parsed.allowedHosts : [],
    };
  } catch {
    return { allowedHosts: [] };
  }
}

function writeConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getAllowedHosts() {
  return readConfig().allowedHosts;
}

/**
 * Adds a domain to the persisted allow-list (de-duplicated). Does NOT
 * take effect until the mkdd-ui container restarts - Vite only reads
 * this at server startup (see vite.config.ts), never while already
 * running.
 */
export function addAllowedHost(host) {
  const trimmed = host.trim().toLowerCase();
  const current = getAllowedHosts();
  if (current.includes(trimmed)) return current;

  const next = [...current, trimmed];
  writeConfig({ allowedHosts: next });
  return next;
}

export function removeAllowedHost(host) {
  const trimmed = host.trim().toLowerCase();
  const next = getAllowedHosts().filter((h) => h !== trimmed);
  writeConfig({ allowedHosts: next });
  return next;
}
