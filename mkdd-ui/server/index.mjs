import http from "node:http";
import { handleStaticFiles } from "./static-files.mjs";
import { handleBranding, handleBrandingIcon, handleHealth } from "./routes/branding.mjs";
import {
  handleWorkflowGet,
  handleWorkflowSummary,
  handleApproveGate,
  handleBlockers,
  handleReviews,
  handleFindings,
  handleReports,
  WORKFLOW_ERROR_CODES,
} from "./routes/workflow.mjs";
import { handleProjects, handleEmployees } from "./routes/directory.mjs";
import { handleCreateProject } from "./routes/projects.mjs";
import { handleProjectUpload } from "./routes/project-upload.mjs";
import { handleServeAvatar, handleUploadAvatar } from "./routes/avatars.mjs";
import { handlePreview } from "./routes/preview.mjs";
import { handleProjectFiles } from "./routes/project-files.mjs";
import { handleProjectLivePort } from "./routes/project-live-port.mjs";
import {
  handleInternalAlert,
  handleInternalHealthDeep,
  handleSystemHealth,
  handleSystemHealthHistory,
} from "./routes/internal-health.mjs";
import { handleProjectTotalCost } from "./routes/project-cost.mjs";
import { startLivePortProxies } from "./live-port-proxy.mjs";
import { handleConversation } from "./routes/conversation.mjs";
import {
  handleChatSend,
  handleChatNew,
  handleChatOpen,
  handleChatEvents,
  handleChatRecentEvents,
  handleChatOlderEvents,
  handleChatWorkPlan,
  handleChatLastMessage,
} from "./routes/chat.mjs";
import { handlePushVapidKey, handlePushSubscribe } from "./routes/push.mjs";
import { handleRestartContainer } from "./routes/settings.mjs";
import {
  handleAuthStatus,
  handleAuthSetup,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthListUsers,
  handleAuthAddUser,
  handleAuthRemoveUser,
  currentUser,
} from "./routes/auth.mjs";
import {
  handleServeOwnerAvatar,
  handleUploadOwnerAvatar,
} from "./routes/owner-avatar.mjs";
import { getInternalServiceKey } from "./lib/internal-service-key.mjs";
import { attachChatWebSocketBridge } from "./lib/ws-bridge.mjs";

// Route handlers are tried in order; each returns `true` once it has
// written a response, or `false` to let the next handler try. This keeps
// the exact same dispatch order as the original single-file server so
// behavior is unchanged - only the organization is different (see
// PROJECT_AUDIT_REPORT.md section 2.1 and section 4, step 3).
const ROUTES = [
  handleAuthStatus,
  handleAuthSetup,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthListUsers,
  handleAuthAddUser,
  handleAuthRemoveUser,
  handleServeOwnerAvatar,
  handleUploadOwnerAvatar,
  handleBranding,
  handleBrandingIcon,
  handleHealth,
  handleWorkflowGet,
  handleWorkflowSummary,
  handleApproveGate,
  handleBlockers,
  handleReviews,
  handleFindings,
  handleReports,
  handleProjects,
  handleCreateProject,
  handleProjectUpload,
  handleEmployees,
  handleServeAvatar,
  handlePreview,
  handleProjectFiles,
  handleProjectLivePort,
  handleProjectTotalCost,
  handleUploadAvatar,
  handleConversation,
  handleChatSend,
  handleChatNew,
  handleChatOpen,
  handleChatEvents,
  handleChatRecentEvents,
  handleChatOlderEvents,
  handleChatWorkPlan,
  handleChatLastMessage,
  handlePushVapidKey,
  handlePushSubscribe,
  handleRestartContainer,
  handleInternalAlert,
  handleInternalHealthDeep,
  handleSystemHealth,
  handleSystemHealthHistory,
  handleStaticFiles,
];

// Paths reachable without being logged in - the absolute minimum
// needed to check auth status, create the first account, and log in.
// Every other /api/ route requires a valid session (BUGS_AND_FIXES.md
// #127) - this is a real security gate, not just hiding UI, so a
// request that bypasses the frontend entirely (e.g. curl) is rejected
// just the same as one made through the browser.
const AUTH_EXEMPT_PATHS = new Set([
  "/api/auth/status",
  "/api/auth/setup",
  "/api/auth/login",
  // BUGS_AND_FIXES.md #142 - critical bug: this was missing after #127
  // introduced the auth gate, silently breaking the auto-deploy system's
  // health check for every commit since (no browser session exists to
  // check health), causing an infinite rollback loop back to the last
  // pre-authentication commit every 20 seconds. A health check reveals
  // no sensitive data (see branding.mjs's handleHealth), so exempting it
  // is safe.
  "/api/health",
]);

// Paths an employee's own process legitimately calls directly via curl
// (documented in AGENTS.md - workflow gate approvals, blockers,
// findings, reviews, reports), plus the health-check system's own
// alert endpoint (BUGS_AND_FIXES.md #157, called only from the VM
// host's own bash script) - see isRequestAuthorized below.
const INTERNAL_SERVICE_PATH_PREFIXES = ["/api/workflow/", "/api/internal/"];

function requiresAuth(url) {
  if (!url?.startsWith("/api/")) return false; // static files are never gated here
  const path = url.split("?")[0];
  return !AUTH_EXEMPT_PATHS.has(path);
}

/**
 * A request passes if EITHER of two independent things is true:
 * 1. It carries a valid owner browser session (currentUser) - works
 *    for every route, exactly as before #134.
 * 2. It's hitting /api/workflow/* or /api/internal/* specifically AND
 *    carries the correct shared secret header (BUGS_AND_FIXES.md #134,
 *    #157) - these are the only other legitimate callers in this
 *    system: an employee's own agent process (workflow endpoints, per
 *    AGENTS.md's documented instructions) and the VM host's own
 *    health-check script (internal endpoints) - neither has a browser
 *    and can never have a session cookie. Deliberately scoped to only
 *    these two path prefixes - never widened to any other endpoint
 *    (chat, settings, projects, etc.), keeping the blast radius of a
 *    leaked service key as narrow as possible.
 */
function isRequestAuthorized(req) {
  if (currentUser(req)) return true;

  const path = req.url?.split("?")[0];
  if (!INTERNAL_SERVICE_PATH_PREFIXES.some((prefix) => path?.startsWith(prefix))) {
    return false;
  }

  const providedKey = req.headers["x-internal-service-key"];
  const expectedKey = getInternalServiceKey();
  return providedKey === expectedKey;
}

const server = http.createServer(async (req, res) => {
  try {
    if (requiresAuth(req.url) && !isRequestAuthorized(req)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_authenticated" }));
      return;
    }

    for (const route of ROUTES) {
      // eslint-disable-next-line no-await-in-loop -- routes are tried in
      // priority order; only one will ever actually do async work.
      if (await route(req, res)) return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (e) {
    // BUGS_AND_FIXES.md #153: if a route already sent a response (headers
    // written) before throwing - e.g. an exception raised while building
    // a JSON.stringify() argument, after writeHead() already ran - writing
    // headers again here throws ERR_HTTP_HEADERS_SENT and crashes the
    // entire Node.js process, breaking every in-flight request (not just
    // this one) until the container auto-restarts. Checking headersSent
    // first means this class of bug degrades to a logged failure instead.
    if (res.headersSent) {
      console.error("Unhandled error after response headers were already sent:", e);
      return;
    }
    const status = WORKFLOW_ERROR_CODES.has(e.message) ? 409 : 502;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

attachChatWebSocketBridge(server);

server.listen(8787, "0.0.0.0", () => console.log("MKDD backend ready on 8787"));
startLivePortProxies();
