import type {
  AgentProfile,
  ConversationResponse,
  EventsResponse,
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
 * Real sum across every conversation ever created for a project
 * (across all employees). Deliberately a separate call from
 * fetchConversation - see BUGS_AND_FIXES.md #65.
 */
export async function fetchProjectTotalCost(projectSlug: string): Promise<number> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/total-cost`);
  const data = await r.json();
  return typeof data.totalCost === "number" ? data.totalCost : 0;
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
  }>;
  reports: Array<{
    id: string;
    gate: WorkflowGateName;
    fromEmployeeId: string;
    toEmployeeId: string;
    title: string;
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
