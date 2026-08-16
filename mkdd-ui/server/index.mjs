import http from "node:http";
import { handleBranding, handleHealth } from "./routes/branding.mjs";
import {
  handleWorkflowGet,
  handleWorkflowSummary,
  handleApproveGate,
  handleBlockers,
  handleReviews,
  handleFindings,
  WORKFLOW_ERROR_CODES,
} from "./routes/workflow.mjs";
import { handleProjects, handleEmployees } from "./routes/directory.mjs";
import { handleCreateProject } from "./routes/projects.mjs";
import { handleServeAvatar, handleUploadAvatar } from "./routes/avatars.mjs";
import { handlePreview } from "./routes/preview.mjs";
import { handleProjectFiles } from "./routes/project-files.mjs";
import { handleProjectLivePort } from "./routes/project-live-port.mjs";
import { startLivePortProxies } from "./live-port-proxy.mjs";
import { handleConversation } from "./routes/conversation.mjs";
import { handleChatSend, handleChatEvents } from "./routes/chat.mjs";
import { attachChatWebSocketBridge } from "./lib/ws-bridge.mjs";

// Route handlers are tried in order; each returns `true` once it has
// written a response, or `false` to let the next handler try. This keeps
// the exact same dispatch order as the original single-file server so
// behavior is unchanged - only the organization is different (see
// PROJECT_AUDIT_REPORT.md section 2.1 and section 4, step 3).
const ROUTES = [
  handleBranding,
  handleHealth,
  handleWorkflowGet,
  handleWorkflowSummary,
  handleApproveGate,
  handleBlockers,
  handleReviews,
  handleFindings,
  handleProjects,
  handleCreateProject,
  handleEmployees,
  handleServeAvatar,
  handlePreview,
  handleProjectFiles,
  handleProjectLivePort,
  handleUploadAvatar,
  handleConversation,
  handleChatSend,
  handleChatEvents,
];

const server = http.createServer(async (req, res) => {
  try {
    for (const route of ROUTES) {
      // eslint-disable-next-line no-await-in-loop -- routes are tried in
      // priority order; only one will ever actually do async work.
      if (await route(req, res)) return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (e) {
    const status = WORKFLOW_ERROR_CODES.has(e.message) ? 409 : 502;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

attachChatWebSocketBridge(server);

server.listen(8787, "0.0.0.0", () => console.log("MKDD backend ready on 8787"));
startLivePortProxies();
