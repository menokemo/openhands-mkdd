import { openhands } from "../lib/openhands-client.mjs";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";
import { readEmployeeDisplayInfo } from "../lib/employee-display-info.mjs";
import { buildEmployeeAvatarUrl } from "./avatars.mjs";
import { getProjectColor } from "../lib/project-metadata.mjs";
import { getWorkflowState } from "../workflow-state.mjs";
import {
  fetchAllConversations,
  findAllProjectConversations,
} from "../lib/authorize-conversation.mjs";

export async function handleProjects(req, res) {
  if (req.method !== "GET" || req.url !== "/api/projects") return false;

  const r = await openhands("/api/workspaces");
  const data = await r.json();

  // BUGS_AND_FIXES.md #81: each project card shows its current workflow
  // gate and when it was last actually worked on - both real, computed
  // here rather than fabricated. currentGate comes from persisted
  // workflow state (same source as the Project Home stepper).
  // lastActivityAt is the most recent updated_at across every real
  // conversation tied to this project - not a guess, not the
  // workspace's own creation time.
  //
  // Fetched ONCE for the whole request (BUGS_AND_FIXES.md #145) - not
  // once per project. The old code called findAllProjectConversations
  // (which fully re-paginates every conversation on the server) inside
  // the per-project map below, so N projects meant N complete re-scans
  // of the exact same data. After days of testing had accumulated many
  // conversations, this made the endpoint take minutes and eventually
  // time out with a 502. Now the expensive scan happens exactly once,
  // and each project just filters the already-fetched list locally.
  const allConversations = await fetchAllConversations();

  data.workspaces = (data.workspaces ?? []).map((workspace) => {
    const conversations = findAllProjectConversations(workspace.path, allConversations);
    const lastActivityAt = conversations.reduce((latest, conversation) => {
      const updatedAt = conversation.updated_at ?? conversation.created_at;
      if (!updatedAt) return latest;
      return !latest || updatedAt > latest ? updatedAt : latest;
    }, null);

    return {
      ...workspace,
      color: getProjectColor(workspace.path),
      currentGate: getWorkflowState(workspace.path).currentGate,
      lastActivityAt,
    };
  });

  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
  return true;
}

export async function handleEmployees(req, res) {
  if (req.url !== "/api/employees") return false;

  const r = await openhands("/api/agent-profiles");
  res.writeHead(r.status, { "content-type": "application/json" });

  const data = await r.json();
  const allowed = new Set(listEmployeeNames());

  data.profiles = (data.profiles ?? [])
    .filter((p) => allowed.has(p.name))
    .map((profile) => {
      const info = readEmployeeDisplayInfo(profile.name);
      return {
        ...profile,
        // BUGS_AND_FIXES.md #48 (round 2): OpenHands' own /api/agent-profiles
        // list returns a real internal UUID as `id` - but every other part
        // of MKDD (bootstrap-employees.mjs, the company-agents-definitions/
        // *.md filenames, chat.mjs's resolveAgentProfileUuid path lookup,
        // README/BUGS_AND_FIXES history) treats the stable human-readable
        // name (e.g. "architect") as THE employee identifier. Overriding
        // `id` here to the name (after spreading `profile`, so this line
        // wins) keeps that single consistent identifier everywhere else in
        // the codebase, instead of leaking OpenHands' internal UUID into
        // MKDD's own logic. Root-caused live: the frontend was sending
        // that UUID as employeeId, which every downstream lookup that
        // expects the name (file paths, path parameters) then failed to
        // resolve - a real 404 confirmed via browser-side diagnostics.
        id: profile.name,
        ...info,
        avatarUrl: buildEmployeeAvatarUrl(profile.name),
      };
    })
    .sort((a, b) => a.order - b.order);

  res.end(JSON.stringify(data));
  return true;
}
