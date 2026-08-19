import fs from "node:fs";

export const OPENHANDS_URL = process.env.OPENHANDS_URL;

let cachedSessionKey = null;

/**
 * Discovers the OpenHands session API key by scanning /proc for the
 * Agent Canvas static-server process and reading its --session-api-key
 * argument. Cached after the first successful discovery (BUGS_AND_FIXES.md
 * #124) - the key is stable for as long as agent-canvas keeps running,
 * so re-scanning the entire system's /proc on every single API call (the
 * previous behavior) added real, unnecessary latency to every request.
 * Call invalidateSessionKey() if a request using the cached key ever
 * fails with 401/403 (the key went stale, e.g. after agent-canvas
 * restarted) to force a fresh scan on the next call.
 *
 * KNOWN TECHNICAL DEBT (see BUGS_AND_FIXES.md #6 and README section 14):
 * this depends on a shared PID namespace with the agent-canvas container
 * and on the current process/launcher shape. It should eventually be
 * replaced by a supported secret/configuration mechanism.
 */
export function sessionKey() {
  if (cachedSessionKey) return cachedSessionKey;

  for (const id of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(id)) continue;
    try {
      const args = fs.readFileSync(`/proc/${id}/cmdline`, "utf8").split("\0");
      if (!args.some((x) => x.includes("static-server.mjs"))) continue;
      const i = args.indexOf("--session-api-key");
      if (i >= 0 && args[i + 1]) {
        cachedSessionKey = args[i + 1];
        return cachedSessionKey;
      }
    } catch {
      // process may have exited between readdir and read; skip it
    }
  }
  throw new Error("OpenHands session key not found");
}

/** Forces the next sessionKey() call to re-scan /proc instead of using a stale cached value. */
export function invalidateSessionKey() {
  cachedSessionKey = null;
}

/**
 * Authenticated GET-style fetch against the OpenHands Agent Server.
 * The session API key is attached server-side only; it is never sent
 * to the browser (see README security principle #1). Automatically
 * retries once with a freshly-discovered key if the cached one was
 * rejected (401/403) - see invalidateSessionKey's doc above.
 */
export async function openhands(path) {
  const response = await fetch(OPENHANDS_URL + path, {
    headers: { "X-Session-API-Key": sessionKey() },
  });

  if ((response.status === 401 || response.status === 403) && cachedSessionKey) {
    invalidateSessionKey();
    return fetch(OPENHANDS_URL + path, {
      headers: { "X-Session-API-Key": sessionKey() },
    });
  }

  return response;
}

/**
 * Authenticated fetch for requests that need a custom method/body
 * (e.g. POST). Always attaches the session key header, merging with
 * any headers the caller provides. Same stale-key retry as openhands().
 */
export async function openhandsFetch(path, init = {}) {
  const response = await fetch(OPENHANDS_URL + path, {
    ...init,
    headers: {
      "X-Session-API-Key": sessionKey(),
      ...(init.headers ?? {}),
    },
  });

  if ((response.status === 401 || response.status === 403) && cachedSessionKey) {
    invalidateSessionKey();
    return fetch(OPENHANDS_URL + path, {
      ...init,
      headers: {
        "X-Session-API-Key": sessionKey(),
        ...(init.headers ?? {}),
      },
    });
  }

  return response;
}
