import { randomUUID } from "node:crypto";
import {
  getWorkflowState,
  listWorkflowSummaries,
  updateWorkflowState,
  GATES,
  REVIEW_ROLES,
} from "../workflow-state.mjs";

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

/**
 * GET /api/workflow/summary — returns gate status for every project that
 * has any persisted workflow state, for the sidebar's project grouping
 * (active / near-completion / completed). See listWorkflowSummaries() for
 * why projects with no persisted state at all are simply absent here.
 */
export async function handleWorkflowSummary(req, res) {
  if (!(req.method === "GET" && req.url === "/api/workflow/summary")) return false;

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ summaries: listWorkflowSummaries() }));
  return true;
}

export async function handleWorkflowGet(req, res) {
  if (!req.url?.startsWith("/api/workflow?")) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const project = url.searchParams.get("project");

  if (!project) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_required" }));
    return true;
  }

  const workflow = getWorkflowState(project);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ workflow }));
  return true;
}

export async function handleApproveGate(req, res) {
  if (!(req.method === "POST" && req.url === "/api/workflow/approve-gate")) {
    return false;
  }

  const { project, gate, approvedBy } = await readJsonBody(req);

  if (!project || !gate || !approvedBy) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_gate_approvedBy_required" }));
    return true;
  }

  const workflow = updateWorkflowState(project, (state) => {
    if (!GATES.includes(gate)) {
      throw new Error("invalid_gate");
    }

    if (state.currentGate !== gate) {
      throw new Error("gate_not_current");
    }

    if (state.blockers.some((item) => item.status === "open")) {
      throw new Error("open_blockers_exist");
    }

    if (state.findings.some((item) => item.status !== "verified")) {
      throw new Error("unverified_findings_exist");
    }

    if (
      gate === "production" &&
      REVIEW_ROLES.some(
        (reviewRole) => state.reviews?.[reviewRole]?.status !== "complete",
      )
    ) {
      throw new Error("mandatory_reviews_incomplete");
    }

    const index = GATES.indexOf(gate);
    const approvedAt = new Date().toISOString();

    state.gates[gate] = {
      status: "approved",
      approvedAt,
    };

    state.approvals.push({
      gate,
      approvedBy,
      approvedAt,
    });

    const nextGate = GATES[index + 1] ?? null;

    if (nextGate) {
      state.currentGate = nextGate;
      state.gates[nextGate] = {
        ...state.gates[nextGate],
        status: "pending",
      };
    }

    return state;
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ workflow }));
  return true;
}

export async function handleBlockers(req, res) {
  if (!(req.method === "POST" && req.url === "/api/workflow/blockers")) {
    return false;
  }

  const { project, action, blockerId, title, createdBy, resolvedBy } =
    await readJsonBody(req);

  if (!project || !action) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_action_required" }));
    return true;
  }

  const workflow = updateWorkflowState(project, (state) => {
    if (action === "add") {
      if (!title?.trim() || !createdBy?.trim()) {
        throw new Error("title_createdBy_required");
      }

      state.blockers.push({
        id: randomUUID(),
        title: title.trim(),
        status: "open",
        createdBy: createdBy.trim(),
        createdAt: new Date().toISOString(),
        resolvedBy: null,
        resolvedAt: null,
      });

      return state;
    }

    if (action === "resolve") {
      if (!blockerId || !resolvedBy?.trim()) {
        throw new Error("blockerId_resolvedBy_required");
      }

      const blocker = state.blockers.find((item) => item.id === blockerId);

      if (!blocker) {
        throw new Error("blocker_not_found");
      }

      if (blocker.status === "resolved") {
        throw new Error("blocker_already_resolved");
      }

      blocker.status = "resolved";
      blocker.resolvedBy = resolvedBy.trim();
      blocker.resolvedAt = new Date().toISOString();

      return state;
    }

    throw new Error("invalid_blocker_action");
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ workflow }));
  return true;
}

export async function handleReviews(req, res) {
  if (!(req.method === "POST" && req.url === "/api/workflow/reviews")) {
    return false;
  }

  const { project, action, reviewRole, reviewedBy } = await readJsonBody(req);

  if (!project || !action || !reviewRole || !reviewedBy) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_action_reviewRole_reviewedBy_required" }));
    return true;
  }

  if (!REVIEW_ROLES.includes(reviewRole)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_review_role" }));
    return true;
  }

  const workflow = updateWorkflowState(project, (state) => {
    const review = state.reviews[reviewRole];

    if (action === "complete") {
      review.status = "complete";
      review.reviewedBy = reviewedBy;
      review.completedAt = new Date().toISOString();
      return state;
    }

    if (action === "reopen") {
      review.status = "pending";
      review.reviewedBy = null;
      review.completedAt = null;
      return state;
    }

    throw new Error("invalid_review_action");
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ workflow }));
  return true;
}

export async function handleFindings(req, res) {
  if (!(req.method === "POST" && req.url === "/api/workflow/findings")) {
    return false;
  }

  const { project, action, findingId, title, reviewer, fixedBy, verifiedBy } =
    await readJsonBody(req);

  if (!project || !action) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "project_action_required" }));
    return true;
  }

  const workflow = updateWorkflowState(project, (state) => {
    if (action === "add") {
      if (!title?.trim() || !reviewer?.trim()) {
        throw new Error("title_reviewer_required");
      }

      state.findings.push({
        id: randomUUID(),
        title: title.trim(),
        reviewer: reviewer.trim(),
        status: "open",
        createdAt: new Date().toISOString(),
        fixedBy: null,
        fixedAt: null,
        verifiedBy: null,
        verifiedAt: null,
      });

      return state;
    }

    const finding = state.findings.find((item) => item.id === findingId);

    if (!finding) {
      throw new Error("finding_not_found");
    }

    if (action === "mark-fixed") {
      if (!fixedBy?.trim()) {
        throw new Error("fixedBy_required");
      }

      if (fixedBy.trim() === finding.reviewer) {
        throw new Error("reviewer_cannot_fix_own_finding");
      }

      if (finding.status !== "open") {
        throw new Error("finding_not_open");
      }

      finding.status = "fixed_pending_verification";
      finding.fixedBy = fixedBy.trim();
      finding.fixedAt = new Date().toISOString();

      return state;
    }

    if (action === "verify") {
      if (!verifiedBy?.trim()) {
        throw new Error("verifiedBy_required");
      }

      if (verifiedBy.trim() !== finding.reviewer) {
        throw new Error("same_reviewer_must_verify");
      }

      if (finding.status !== "fixed_pending_verification") {
        throw new Error("finding_not_ready_for_verification");
      }

      finding.status = "verified";
      finding.verifiedBy = verifiedBy.trim();
      finding.verifiedAt = new Date().toISOString();

      return state;
    }

    throw new Error("invalid_finding_action");
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ workflow }));
  return true;
}

/** All known workflow-rule violation error messages -> HTTP 409 (conflict). */
export const WORKFLOW_ERROR_CODES = new Set([
  "invalid_gate",
  "gate_not_current",
  "open_blockers_exist",
  "unverified_findings_exist",
  "mandatory_reviews_incomplete",
  "title_createdBy_required",
  "blockerId_resolvedBy_required",
  "blocker_not_found",
  "blocker_already_resolved",
  "invalid_blocker_action",
  "title_reviewer_required",
  "finding_not_found",
  "fixedBy_required",
  "reviewer_cannot_fix_own_finding",
  "finding_not_open",
  "verifiedBy_required",
  "same_reviewer_must_verify",
  "finding_not_ready_for_verification",
  "invalid_finding_action",
  "invalid_workflow_state",
  "invalid_current_gate",
]);
