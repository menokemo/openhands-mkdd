import fs from "node:fs";
import http from "node:http";
import { resolveProjectDir } from "../lib/project-paths.mjs";

// The port every employee's own running dev/preview server is expected
// to bind to, inside the shared agent-canvas container. Deliberately
// NOT 3000 or 8000 - those are already used by Agent Canvas's own UI
// and Agent Server respectively (see compose.yml), and binding there
// would conflict with them.
const LIVE_APP_PORT = process.env.MKDD_LIVE_APP_PORT
  ? Number(process.env.MKDD_LIVE_APP_PORT)
  : 4001;

// Same hostname MKDD already uses to reach the agent-canvas container
// for every other OpenHands API call (see server/lib/openhands-client.mjs).
// Resolved lazily (at request time, not module load time) so importing
// this module for testing doesn't require OPENHANDS_URL to be set.
function agentCanvasHost() {
  return new URL(process.env.OPENHANDS_URL).hostname;
}

/**
 * Splits a raw /live/{projectSlug}/{...path} request path into its
 * project slug and the path to forward to the live server. Exported
 * separately so this parsing logic can be unit-tested without needing
 * a real HTTP request or a running proxy target.
 */
export function parseLiveProxyPath(rawPath) {
  const slashIndex = rawPath.indexOf("/");
  const projectSlug = slashIndex === -1 ? rawPath : rawPath.slice(0, slashIndex);
  const forwardPath = slashIndex === -1 ? "/" : rawPath.slice(slashIndex);
  return { projectSlug, forwardPath: forwardPath || "/" };
}

/**
 * Reverse-proxies /live/{projectSlug}/{...path} to whatever real,
 * currently-running server an employee has started on LIVE_APP_PORT
 * inside the shared agent-canvas container (via their own bash tool -
 * e.g. `npm start`, `python manage.py runserver 0.0.0.0:4001`).
 *
 * Unlike server/routes/preview.mjs (static files only), this is a real
 * HTTP reverse proxy to a live, running backend - the owner sees the
 * actual application working, not a snapshot. Only one project's live
 * server can be reachable at a time (whichever one currently has
 * something bound to LIVE_APP_PORT) - a deliberate, discussed trade-off
 * for a first version, not an oversight. projectSlug is validated
 * against the real /projects directory (reusing the same helper as
 * preview.mjs) mainly for consistency/sanity, not because it changes
 * the proxy target - the target is always the same shared port.
 */
export async function handleLiveProxy(req, res) {
  if (!req.url?.startsWith("/live/")) return false;

  const rawPath = decodeURIComponent(req.url.slice("/live/".length));
  const { projectSlug, forwardPath } = parseLiveProxyPath(rawPath);

  const projectDir = resolveProjectDir(projectSlug);
  if (!projectDir || !fs.existsSync(projectDir)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Unknown project");
    return true;
  }

  const proxyReq = http.request(
    {
      host: agentCanvasHost(),
      port: LIVE_APP_PORT,
      path: forwardPath || "/",
      method: req.method,
      headers: { ...req.headers, host: `${agentCanvasHost()}:${LIVE_APP_PORT}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    // The employee's server isn't running (or isn't on LIVE_APP_PORT) -
    // a clear, honest message instead of a generic browser connection
    // error, matching README section 47's "never fabricate" principle
    // (we don't pretend a live app exists when it doesn't).
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(
        "No live server is currently running for this project on the shared live-preview port.",
      );
    }
  });

  req.pipe(proxyReq);
  return true;
}
