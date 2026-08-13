import fs from "node:fs";

export const OPENHANDS_URL = process.env.OPENHANDS_URL;

/**
 * Discovers the OpenHands session API key by scanning /proc for the
 * Agent Canvas static-server process and reading its --session-api-key
 * argument.
 *
 * KNOWN TECHNICAL DEBT (see BUGS_AND_FIXES.md #6 and README section 14):
 * this depends on a shared PID namespace with the agent-canvas container
 * and on the current process/launcher shape. It should eventually be
 * replaced by a supported secret/configuration mechanism.
 */
export function sessionKey() {
  for (const id of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(id)) continue;
    try {
      const args = fs.readFileSync(`/proc/${id}/cmdline`, "utf8").split("\0");
      if (!args.some((x) => x.includes("static-server.mjs"))) continue;
      const i = args.indexOf("--session-api-key");
      if (i >= 0 && args[i + 1]) return args[i + 1];
    } catch {
      // process may have exited between readdir and read; skip it
    }
  }
  throw new Error("OpenHands session key not found");
}

/**
 * Authenticated GET-style fetch against the OpenHands Agent Server.
 * The session API key is attached server-side only; it is never sent
 * to the browser (see README security principle #1).
 */
export async function openhands(path) {
  return fetch(OPENHANDS_URL + path, {
    headers: { "X-Session-API-Key": sessionKey() },
  });
}

/**
 * Authenticated fetch for requests that need a custom method/body
 * (e.g. POST). Always attaches the session key header, merging with
 * any headers the caller provides.
 */
export async function openhandsFetch(path, init = {}) {
  return fetch(OPENHANDS_URL + path, {
    ...init,
    headers: {
      "X-Session-API-Key": sessionKey(),
      ...(init.headers ?? {}),
    },
  });
}
