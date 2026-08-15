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

// Common absolute-root path prefixes modern frameworks use for their own
// static assets (Next.js's /_next/, Nuxt's /__nuxt/, and the generic
// /static/ and /assets/ conventions many others use). When an employee's
// app is mounted under /live/{project}/ instead of the site root, these
// absolute references break unless rewritten - this is what makes a
// live-mounted app actually render with styling/interactivity instead of
// loading as a blank page, without requiring every employee to
// special-case their framework's own basePath/publicPath config.
const REWRITABLE_ROOT_PREFIXES = ["/_next/", "/__nuxt/", "/static/", "/assets/"];

/**
 * Rewrites occurrences of REWRITABLE_ROOT_PREFIXES that immediately
 * follow a quote or opening parenthesis (how they appear in HTML
 * href/src attributes and in embedded JSON/JS string literals alike -
 * Next.js's own RSC payload reuses the same literal path strings inside
 * <script> blocks, not just in tag attributes) to be relative to
 * /live/{projectSlug}/ instead of the site root.
 *
 * Exported separately so this can be unit-tested against real captured
 * HTML without needing a live server.
 */
export function rewriteLiveAppHtml(html, projectSlug) {
  let result = html;
  for (const prefix of REWRITABLE_ROOT_PREFIXES) {
    const escaped = prefix.replace(/[/]/g, "\\/");
    const pattern = new RegExp(`(["'(])${escaped}`, "g");
    result = result.replace(pattern, `$1/live/${projectSlug}${prefix}`);
  }
  return result;
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
 *
 * HTML responses are rewritten (see rewriteLiveAppHtml) so common
 * framework asset paths resolve correctly under the /live/{project}/
 * mount point - this is what makes the live app actually render
 * correctly (BUGS_AND_FIXES.md #52), not just return a 200 with broken
 * styling. Non-HTML responses (the assets themselves, once correctly
 * requested at their rewritten /live/{project}/... URL) are streamed
 * through unmodified, since they're already reached at the right path.
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
      headers: {
        ...req.headers,
        host: `${agentCanvasHost()}:${LIVE_APP_PORT}`,
        // The HTML-rewrite step below reads the response body as UTF-8
        // text - a compressed (gzip/br) body would be corrupted by that.
        // Requesting identity encoding avoids needing to decompress and
        // recompress the response ourselves.
        "accept-encoding": "identity",
      },
    },
    (proxyRes) => {
      const isHtml = (proxyRes.headers["content-type"] ?? "").includes("text/html");

      if (!isHtml) {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
        return;
      }

      // HTML needs the full body in memory to rewrite it - can't stream
      // and rewrite at the same time without risking splitting a match
      // across chunk boundaries.
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const original = Buffer.concat(chunks).toString("utf8");
        const rewritten = rewriteLiveAppHtml(original, projectSlug);

        const headers = { ...proxyRes.headers };
        delete headers["content-encoding"];
        headers["content-length"] = Buffer.byteLength(rewritten);

        res.writeHead(proxyRes.statusCode ?? 502, headers);
        res.end(rewritten);
      });
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
