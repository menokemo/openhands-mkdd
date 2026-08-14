import type { Workspace } from "../types";
import type { WorkflowSummary } from "../api/client";

export type ProjectGateGroup = "active" | "nearCompletion" | "completed";

/**
 * Classifies a project by real, persisted workflow gate data (never
 * fabricated - matches README section 47's "no invented data" principle):
 *   - active: still in gates 1-3 (requirements / ui_ux / architecture).
 *   - nearCompletion: reached gate 4 (production) but not yet approved.
 *   - completed: the production gate has been approved.
 *
 * A project with no persisted workflow state at all (brand new) has never
 * touched its workflow, which is exactly the same real state as
 * "currentGate: requirements" - so it's classified as active, matching
 * what getWorkflowState() would return for it server-side anyway.
 */
export function categorizeProject(
  project: Workspace,
  summaries: Record<string, WorkflowSummary>,
): ProjectGateGroup {
  const summary = summaries[project.path];
  if (!summary) return "active";
  if (summary.productionApproved) return "completed";
  if (summary.currentGate === "production") return "nearCompletion";
  return "active";
}

export function groupProjectsByGateStatus(
  projects: Workspace[],
  summaries: Record<string, WorkflowSummary>,
): Record<ProjectGateGroup, Workspace[]> {
  const groups: Record<ProjectGateGroup, Workspace[]> = {
    active: [],
    nearCompletion: [],
    completed: [],
  };

  for (const project of projects) {
    groups[categorizeProject(project, summaries)].push(project);
  }

  return groups;
}
