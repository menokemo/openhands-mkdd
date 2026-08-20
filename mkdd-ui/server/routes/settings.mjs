import http from "node:http";

/**
 * Real access control (not just hiding a UI button, which would be
 * purely cosmetic - see BUGS_AND_FIXES.md #112): rejects any settings
 * request whose Host header isn't a local/private address. NPM (or any
 * reverse proxy) preserves the original Host header by default when
 * forwarding requests, so a request that arrives via the public domain
 * carries that domain in the Host header, while a request made
 * directly against the local IP carries that IP instead - letting the
 * backend reliably tell them apart regardless of what the frontend UI
 * shows or hides.
 */
function isLocalHostRequest(req) {
  const host = (req.headers.host ?? "").split(":")[0];

  if (host === "localhost" || host === "127.0.0.1") return true;

  // RFC 1918 private IPv4 ranges - covers typical LAN/VPN (e.g.
  // WireGuard) addresses like 192.168.x.x, 10.x.x.x, 172.16-31.x.x.
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

function rejectNonLocal(res) {
  res.writeHead(403, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "local_access_only" }));
}

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
 * POST /api/settings/restart-container — restarts this app's own
 * container, so any future config/env var change (or a stuck process)
 * can be applied without the owner needing to SSH in and run a docker
 * command manually (BUGS_AND_FIXES.md #110). Responds BEFORE the
 * restart completes (the container is about to die, so waiting for it
 * to come back up here isn't possible) - the frontend must show a
 * clear "restarting, wait and refresh" message rather than expecting a
 * normal success flow.
 */
export async function handleRestartContainer(req, res) {
  if (!(req.method === "POST" && req.url === "/api/settings/restart-container")) {
    return false;
  }

  if (!isLocalHostRequest(req)) {
    rejectNonLocal(res);
    return true;
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
