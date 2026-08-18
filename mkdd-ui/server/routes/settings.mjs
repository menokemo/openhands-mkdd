import http from "node:http";
import { getAllowedHosts, addAllowedHost, removeAllowedHost } from "../site-config.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";

/**
 * Restarts this app's own container via the Docker Engine API, reached
 * over the socket mounted into this container (BUGS_AND_FIXES.md #110)
 * - see compose.yml's volumes section for the real security tradeoff
 * that mount represents. Uses Node's built-in http module's Unix-
 * socket support rather than a new dependency (dockerode etc.).
 *
 * The restart happens from the OUTSIDE (the Docker daemon, a separate
 * process from this container), so it's safe for a container to
 * request its own restart - this is a well-established pattern, not a
 * "the rug gets pulled out from under itself" problem.
 */
function restartContainer(containerName) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: "/var/run/docker.sock",
        path: `/containers/${encodeURIComponent(containerName)}/restart`,
        method: "POST",
      },
      (res) => {
        // Docker's restart call returns 204 No Content on success - we
        // don't wait for the container to actually come back up (that
        // happens after this process itself is killed), just confirm
        // the daemon accepted the request.
        if (res.statusCode === 204 || res.statusCode === 202) {
          resolve();
        } else {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            reject(new Error(`docker_restart_failed_${res.statusCode}: ${body}`)),
          );
        }
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * GET /api/settings/allowed-hosts — returns the currently persisted
 * domain list (BUGS_AND_FIXES.md #109), so the UI can display what's
 * already configured, not just accept new input blindly.
 */
export async function handleGetAllowedHosts(req, res) {
  if (!(req.method === "GET" && req.url === "/api/settings/allowed-hosts")) {
    return false;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ allowedHosts: getAllowedHosts() }));
  return true;
}

/**
 * POST /api/settings/allowed-hosts — adds a domain to the persisted
 * allow-list. Saving here does NOT make the domain work immediately -
 * Vite only reads this list at server startup, so the response
 * explicitly says a restart is required, and the frontend must show
 * that plainly rather than implying it's live.
 */
export async function handlePostAllowedHosts(req, res) {
  if (!(req.method === "POST" && req.url === "/api/settings/allowed-hosts")) {
    return false;
  }

  const { host } = await readJsonBody(req);

  if (!host?.trim()) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "host_required" }));
    return true;
  }

  const allowedHosts = addAllowedHost(host);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ allowedHosts, restartRequired: true }));
  return true;
}

/** DELETE via POST body (no DELETE verb elsewhere in this app - consistent). */
export async function handleRemoveAllowedHost(req, res) {
  if (!(req.method === "POST" && req.url === "/api/settings/allowed-hosts/remove")) {
    return false;
  }

  const { host } = await readJsonBody(req);

  if (!host?.trim()) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "host_required" }));
    return true;
  }

  const allowedHosts = removeAllowedHost(host);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ allowedHosts, restartRequired: true }));
  return true;
}

/**
 * POST /api/settings/restart-container — actually restarts this app's
 * own container (BUGS_AND_FIXES.md #110), so a saved domain change
 * takes effect without the owner needing to SSH in and run a docker
 * command manually. Responds BEFORE the restart completes (the
 * container is about to die, so waiting for it to come back up here
 * isn't possible) - the frontend must show a clear "restarting, wait
 * and refresh" message rather than expecting a normal success flow.
 */
export async function handleRestartContainer(req, res) {
  if (!(req.method === "POST" && req.url === "/api/settings/restart-container")) {
    return false;
  }

  const containerName = process.env.MKDD_UI_CONTAINER_NAME ?? "mkdd-ui";

  try {
    // Respond first, THEN trigger the restart - once the Docker daemon
    // accepts the restart request, this process may be killed at any
    // moment, so the HTTP response must already be flushed to the
    // client before that happens.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ restarting: true }));
    await restartContainer(containerName);
  } catch {
    // If we already responded 200, there's nothing further to send -
    // this can only fail here if the Docker socket isn't actually
    // mounted (an older deployment that hasn't picked up
    // compose.yml's volumes change yet), which the owner will notice
    // when the container simply never restarts.
  }
  return true;
}
