import type {
  AgentProfile,
  ConversationResponse,
  EventsResponse,
  SendMessageResponse,
  Workspace,
} from "../types";

export async function fetchProjects(): Promise<Workspace[]> {
  const r = await fetch("/api/projects");
  const data = await r.json();

  return (data.workspaces ?? []).filter(
    (workspace: Workspace) => workspace.path !== "/projects",
  );
}

export async function fetchEmployees(): Promise<AgentProfile[]> {
  const r = await fetch("/api/employees");
  const data = await r.json();

  return data.profiles ?? [];
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

export async function sendChatMessage(
  project: string,
  employeeId: string,
  employeeName: string,
  message: string,
): Promise<SendMessageResponse> {
  const r = await fetch("/api/chat/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      employeeId,
      employeeName,
      message,
    }),
  });

  return r.json();
}

export type WorkflowGateName = "requirements" | "ui_ux" | "architecture" | "production";

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

export async function fetchWorkflow(project: string): Promise<WorkflowState> {
  const qs = new URLSearchParams({ project });
  const r = await fetch(`/api/workflow?${qs}`);
  const data = await r.json();
  return data.workflow;
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
