import { getAllowedHosts, addAllowedHost, removeAllowedHost } from "../site-config.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";

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
