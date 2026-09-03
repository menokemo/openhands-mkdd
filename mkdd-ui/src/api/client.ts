import type {
  AgentProfile,
  ConversationResponse,
  EventsResponse,
  ChatOpenResponse,
  RecentEventsResponse,
  OlderEventsResponse,
  OlderConversationResponse,
  SendMessageResponse,
  WorkflowGateName,
  WorkPlan,
  Workspace,
} from "../types";

export type ProjectFile = {
  path: string;
  type: "file" | "directory";
  size?: number;
};

export async function fetchProjectFiles(projectSlug: string): Promise<ProjectFile[]> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/files`);
  const data = await r.json();
  return data.files ?? [];
}

/**
 * Real git repo info for a project (BUGS_AND_FIXES.md #166) - repo name
 * from the local .git/config, recent commits and clean/dirty status
 * from OpenHands' own git endpoints. No live GitHub PR/CI status - see
 * the backend endpoint's own comment for why that's deliberately out of
 * scope for the open-source OpenHands this deployment runs.
 */
export type ProjectCommit = {
  sha: string;
  short_sha: string;
  subject: string;
  author: string;
  timestamp: string;
};

export type ProjectGitInfo = {
  repoUrl: string | null;
  commits: ProjectCommit[];
  uncommittedChanges: number | null;
};

export async function fetchProjectGitInfo(
  projectPath: string,
  limit?: number,
): Promise<ProjectGitInfo> {
  const qs = new URLSearchParams({ project: projectPath });
  if (limit) qs.set("limit", String(limit));
  const r = await fetch(`/api/projects/git-info?${qs}`);
  return r.json();
}

/**
 * Real sum across every conversation ever created for a project
 * (across all employees). Deliberately a separate call from
 * fetchConversation - see BUGS_AND_FIXES.md #65.
 */
export async function fetchProjectTotalCost(
  projectSlug: string,
): Promise<{ totalCost: number; budget: number | null }> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/total-cost`);
  const data = await r.json();
  return {
    totalCost: typeof data.totalCost === "number" ? data.totalCost : 0,
    budget: typeof data.budget === "number" ? data.budget : null,
  };
}

/**
 * Sets (or clears, with budget: null) the owner's own real per-project
 * cost budget in USD (BUGS_AND_FIXES.md #216).
 */
export async function setProjectBudget(
  projectSlug: string,
  budget: number | null,
): Promise<number | null> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/budget`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ budget }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "budget_update_failed");
  return typeof data.budget === "number" ? data.budget : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads real files (e.g. real product photos) directly into a
 * project's own shared directory - not tied to any single employee's
 * conversation, so any employee can see and use them immediately.
 */
export async function uploadProjectFiles(
  projectSlug: string,
  files: File[],
): Promise<void> {
  const payload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      dataUrl: await readFileAsDataUrl(file),
    })),
  );

  const r = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: payload }),
  });

  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error ?? "upload_failed");
  }
}

export async function fetchProjects(): Promise<Workspace[]> {
  const r = await fetch("/api/projects");
  const data = await r.json();

  return (data.workspaces ?? []).filter(
    (workspace: Workspace) => workspace.path !== "/projects",
  );
}

export async function createProject(name: string, color?: string): Promise<Workspace> {
  const r = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "project_creation_failed");
  return data.project;
}

/**
 * Imports an existing external Git repository as a permanent MKDD
 * project (BUGS_AND_FIXES.md #194) - for auditing/maintaining a
 * pre-existing project that wasn't built through MKDD.
 */
export async function importProject(
  name: string,
  url: string,
  color?: string,
): Promise<Workspace> {
  const r = await fetch("/api/projects/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, url, color }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "project_import_failed");
  return data.project;
}

export async function fetchEmployees(): Promise<AgentProfile[]> {
  const r = await fetch("/api/employees");
  const data = await r.json();

  return data.profiles ?? [];
}

export async function uploadEmployeeAvatar(
  employeeId: string,
  imageDataUrl: string,
): Promise<string> {
  const r = await fetch(`/api/employees/${employeeId}/avatar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "avatar_upload_failed");
  return data.avatarUrl;
}

export async function fetchConversation(
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<ConversationResponse> {
  const qs = new URLSearchParams({
    project,
    employeeId,
    employeeName,
  });
  const r = await fetch(`/api/conversation?${qs}`);

  return r.json();
}

/**
 * The chat screen's actual initial load (BUGS_AND_FIXES.md #121) -
 * ONE request that resolves the conversation AND its most recent
 * messages together, instead of two separate round-trips where the
 * second genuinely depended on the first's result anyway.
 */
export async function fetchChatOpen(
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<ChatOpenResponse> {
  const qs = new URLSearchParams({ project, employeeId, employeeName });
  const r = await fetch(`/api/chat/open?${qs}`);

  return r.json();
}

export async function fetchEvents(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<EventsResponse> {
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
  });
  const r = await fetch(`/api/chat/events?${qs}`);

  return r.json();
}

/**
 * Fetches only the most recent messages (BUGS_AND_FIXES.md #121) - the
 * chat screen's actual initial load, replacing fetchEvents (full
 * history) for that purpose. Loads fast like a real messaging app;
 * older messages are fetched on demand via fetchOlderEvents when the
 * owner scrolls up.
 */
export async function fetchRecentEvents(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<RecentEventsResponse> {
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
  });
  const r = await fetch(`/api/chat/events/recent?${qs}`);

  return r.json();
}

/** Loads the next (older) page following a previous recent/older call's nextPageId. */
export async function fetchOlderEvents(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
  pageId: string,
): Promise<OlderEventsResponse> {
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
    pageId,
  });
  const r = await fetch(`/api/chat/events/older?${qs}`);

  return r.json();
}

/**
 * BUGS_AND_FIXES.md #218: when the current conversation's own history
 * is exhausted (fetchOlderEvents returned hasMore: false), this finds
 * and loads the conversation that came before it (from a "start new
 * conversation" break), if any.
 */
export async function fetchOlderConversation(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<OlderConversationResponse> {
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
  });
  const r = await fetch(`/api/chat/older-conversation?${qs}`);

  return r.json();
}

/**
 * Like fetchEvents, but returns only the derived work_plan, not the
 * full event history - used by the frequent (5s x 14 employees)
 * team-status poll, which never needed the full events, only the
 * small summary derived from them (BUGS_AND_FIXES.md #66).
 */
export async function fetchWorkPlan(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<{ work_plan: WorkPlan | null }> {
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
  });
  const r = await fetch(`/api/chat/work-plan?${qs}`);

  return r.json();
}

/**
 * Lightweight endpoint powering the unread-message badge on the team
 * strip - see BUGS_AND_FIXES.md #106.
 */
export async function fetchLastMessage(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
): Promise<{ lastMessageAt: string | null; lastMessageFrom: string | null }> {
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
  });
  const r = await fetch(`/api/chat/last-message?${qs}`);

  return r.json();
}

export async function sendChatMessage(
  project: string,
  employeeId: string,
  employeeName: string,
  message: string,
  imageDataUrls?: string[],
): Promise<SendMessageResponse> {
  const r = await fetch("/api/chat/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      employeeId,
      employeeName,
      message,
      imageDataUrls,
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "send_message_failed");
  return data;
}

/**
 * Always creates a brand-new conversation with this employee for this
 * project, even if one already exists - unlike sendChatMessage, which
 * reuses an existing conversation when there is one. The old
 * conversation isn't deleted; it just stops being the one MKDD's UI
 * resolves to going forward (BUGS_AND_FIXES.md #61).
 */
export async function startNewConversation(
  project: string,
  employeeId: string,
  employeeName: string,
  message: string,
  imageDataUrls?: string[],
): Promise<SendMessageResponse> {
  const r = await fetch("/api/chat/new", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      employeeId,
      employeeName,
      message,
      imageDataUrls,
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "start_new_conversation_failed");
  return data;
}

export type { WorkflowGateName } from "../types";

export type WorkflowReviewRole =
  "qa" | "test_automation" | "code_review" | "security_review";

export type WorkflowState = {
  project: string;
  currentGate: WorkflowGateName;
  gates: Record<
    WorkflowGateName,
    {
      status: "locked" | "pending" | "approved";
      approvedAt: string | null;
    }
  >;
  approvals: Array<{
    gate: WorkflowGateName;
    approvedBy: string;
    approvedAt: string;
  }>;
  blockers: Array<{
    id: string;
    title: string;
    status: "open" | "resolved";
    createdBy: string;
    createdAt: string;
    resolvedBy?: string;
    resolvedAt?: string;
    evidence?: string | null;
  }>;
  findings: Array<{
    id: string;
    title: string;
    reviewer: string;
    status: "open" | "fixed_pending_verification" | "verified";
    createdAt: string;
    fixedBy?: string;
    fixedAt?: string;
    verifiedBy?: string;
    verifiedAt?: string;
    fixEvidence?: string | null;
    verifyEvidence?: string | null;
  }>;
  reports: Array<{
    id: string;
    gate: WorkflowGateName;
    fromEmployeeId: string;
    toEmployeeId: string;
    title: string;
    details: string | null;
    status: "open" | "implemented" | "declined" | "closed";
    note: string | null;
    createdAt: string;
    respondedAt: string | null;
    closedAt: string | null;
  }>;
  reviews: Record<
    WorkflowReviewRole,
    {
      status: "pending" | "complete";
      reviewedBy: string | null;
      completedAt: string | null;
      evidence?: string | null;
    }
  >;
  updatedAt: string;
};

export type WorkflowSummary = {
  currentGate: WorkflowGateName;
  productionApproved: boolean;
};

export async function fetchWorkflow(project: string): Promise<WorkflowState> {
  const qs = new URLSearchParams({ project });
  const r = await fetch(`/api/workflow?${qs}`);
  const data = await r.json();
  return data.workflow;
}

/** Gate status for every project with any persisted workflow state - used by the sidebar to group projects. */
export async function fetchWorkflowSummaries(): Promise<Record<string, WorkflowSummary>> {
  const r = await fetch("/api/workflow/summary");
  const data = await r.json();
  return data.summaries ?? {};
}

export async function approveWorkflowGate(
  project: string,
  gate: WorkflowGateName,
  approvedBy: string,
): Promise<WorkflowState> {
  const r = await fetch("/api/workflow/approve-gate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, gate, approvedBy }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "workflow_gate_approval_failed");
  return data.workflow;
}

/**
 * Final closure of a cross-employee report - the one step in this
 * feature's lifecycle that's a real owner action from the UI (creating
 * a report and the employee's response happen via curl, documented in
 * AGENTS.md, same pattern as findings/blockers). Only valid once the
 * employee has responded (implemented or declined) - enforced
 * server-side.
 */
export async function closeWorkflowReport(
  project: string,
  reportId: string,
): Promise<WorkflowState> {
  const r = await fetch("/api/workflow/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, action: "close", reportId }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "report_close_failed");
  return data.workflow;
}

export async function updateWorkflowReview(
  project: string,
  action: "complete" | "reopen",
  reviewRole: WorkflowReviewRole,
  reviewedBy: string,
): Promise<WorkflowState> {
  const r = await fetch("/api/workflow/reviews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      action,
      reviewRole,
      reviewedBy,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "workflow_review_update_failed");
  return data.workflow;
}

/**
 * Actually restarts the mkdd-ui container via the Docker socket
 * (BUGS_AND_FIXES.md #110) - the response arrives before the restart
 * completes (the container is about to die), so this resolving
 * successfully only confirms the request was accepted, not that the
 * new domain is live yet.
 */
export async function restartContainer(): Promise<void> {
  await fetch("/api/settings/restart-container", { method: "POST" });
}

/**
 * System health status (BUGS_AND_FIXES.md #158) - the current result of
 * deploy/health-check.sh's last run, for the sidebar health screen.
 */
export type SystemHealthCheck = {
  name: string;
  ok: boolean | null;
  message: string;
  meta?: { resetsAt?: number } | null;
};

export type SystemHealthStatus = {
  checkedAt: string | null;
  ok: boolean | null;
  checks: SystemHealthCheck[];
};

export async function fetchSystemHealth(): Promise<SystemHealthStatus> {
  const r = await fetch("/api/system-health");
  return r.json();
}

export type SystemHealthHistoryEvent = {
  at: string;
  name: string;
  transition: "became_unhealthy" | "recovered";
  message: string;
};

export async function fetchSystemHealthHistory(): Promise<{
  events: SystemHealthHistoryEvent[];
}> {
  const r = await fetch("/api/system-health-history");
  return r.json();
}

/**
 * Authentication (BUGS_AND_FIXES.md #127). All these calls include
 * credentials (the session cookie) automatically since they're same-
 * origin fetches.
 */
export type AuthStatus = {
  setupRequired: boolean;
  loggedIn: boolean;
  username: string | null;
  avatarUrl: string | null;
};

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const r = await fetch("/api/auth/status");
  return r.json();
}

export async function setupFirstAccount(
  username: string,
  password: string,
): Promise<{ username: string; avatarUrl: string | null }> {
  const r = await fetch("/api/auth/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "setup_failed");
  return data;
}

export async function login(
  username: string,
  password: string,
): Promise<{ username: string; avatarUrl: string | null }> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "login_failed");
  return data;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export type AuthUser = { id: string; username: string };

export async function fetchAuthUsers(): Promise<AuthUser[]> {
  const r = await fetch("/api/auth/users");
  const data = await r.json();
  return data.users ?? [];
}

export async function addAuthUser(username: string, password: string): Promise<AuthUser> {
  const r = await fetch("/api/auth/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "add_user_failed");
  return data;
}

export async function removeAuthUser(userId: string): Promise<void> {
  const r = await fetch("/api/auth/users/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!r.ok) throw new Error("remove_user_failed");
}

/** Uploads (or replaces) the logged-in user's own profile photo. */
export async function uploadOwnerAvatar(imageDataUrl: string): Promise<string | null> {
  const r = await fetch("/api/auth/me/avatar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "avatar_upload_failed");
  return data.avatarUrl ?? null;
}

/**
 * Auto-resume events for one employee on one project (BUGS_AND_FIXES.md
 * #176) - shown in a dedicated Employee Insights tab instead of as a
 * normal chat message, per explicit owner request.
 */
export type AutoResumeLogEntry = {
  at: string;
  employeeName: string;
};

export async function fetchEmployeeAutoResumeLog(
  project: string,
  employeeId: string,
): Promise<AutoResumeLogEntry[]> {
  const qs = new URLSearchParams({ project, employeeId });
  const r = await fetch(`/api/employee-auto-resume-log?${qs}`);
  const data = await r.json();
  return data.entries ?? [];
}
