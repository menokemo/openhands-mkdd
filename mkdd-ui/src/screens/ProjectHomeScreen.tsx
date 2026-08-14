import type { AgentProfile } from "../types";
import type { ProjectEmployeeStatus } from "../hooks/useProjectTeamStatus";
import type { WorkflowGateName, WorkflowReviewRole, WorkflowState } from "../api/client";
import EmployeeAvatarUpload from "../components/EmployeeAvatarUpload";

type Props = {
  employees: AgentProfile[];
  teamStatusByEmployeeId: Map<string, ProjectEmployeeStatus>;
  totalProjectCost: number;
  teamStatusLoading: boolean;
  workflow: WorkflowState | null;
  workflowLoading: boolean;
  language: "ar" | "en";
  onOpenEmployee: (employee: AgentProfile) => void;
  onUploadAvatar: (employeeSlug: string, imageDataUrl: string) => Promise<void>;
};

const GATES: WorkflowGateName[] = ["requirements", "ui_ux", "architecture", "production"];

const REVIEW_ROLES: WorkflowReviewRole[] = [
  "qa",
  "test_automation",
  "code_review",
  "security_review",
];

/**
 * Body content for the Project Home screen. The header and back
 * navigation live in AppHeader/BreadcrumbBar (rendered once by App.tsx) -
 * this component only owns what's specific to a single project's page.
 */
export default function ProjectHomeScreen({
  employees,
  teamStatusByEmployeeId,
  totalProjectCost,
  teamStatusLoading,
  workflow,
  workflowLoading,
  language,
  onOpenEmployee,
  onUploadAvatar,
}: Props) {
  const workingCount = Array.from(teamStatusByEmployeeId.values()).filter(
    (item) => item.executionStatus === "running",
  ).length;

  const openBlockers =
    workflow?.blockers.filter((item) => item.status === "open").length ?? 0;

  const unverifiedFindings =
    workflow?.findings.filter((item) => item.status !== "verified").length ?? 0;

  const gateLabel = (gate: WorkflowGateName) => {
    const labels = {
      requirements: language === "ar" ? "المتطلبات" : "Requirements",
      ui_ux: language === "ar" ? "واجهة وتجربة المستخدم" : "UI/UX",
      architecture: language === "ar" ? "المعمارية" : "Architecture",
      production: language === "ar" ? "الإنتاج" : "Production",
    };

    return labels[gate];
  };

  const reviewLabel = (role: WorkflowReviewRole) => {
    const labels = {
      qa: "QA",
      test_automation: language === "ar" ? "الاختبارات الآلية" : "Test Automation",
      code_review: language === "ar" ? "مراجعة الكود" : "Code Review",
      security_review: language === "ar" ? "مراجعة الأمان" : "Security Review",
    };

    return labels[role];
  };

  return (
    <main className="app project-home">
      <section className="project-home-section project-team-section">
        <div className="section-heading">
          <div>
            <small>MKDD</small>
            <h2>{language === "ar" ? "فريق المشروع" : "Project team"}</h2>
          </div>

          <span className="employee-count">{employees.length}</span>
        </div>

        <div className="employee-grid">
          {employees.map((employee) => {
            const status = teamStatusByEmployeeId.get(employee.id);
            const label =
              language === "ar" ? employee.displayNameAr : employee.displayNameEn;

            return (
              <div
                className={`employee-card${
                  status?.executionStatus === "running" ? " employee-card-running" : ""
                }`}
                key={employee.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenEmployee(employee)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenEmployee(employee);
                  }
                }}
              >
                <EmployeeAvatarUpload
                  employee={employee}
                  label={label}
                  language={language}
                  onUpload={onUploadAvatar}
                />

                <div className="employee-card-info">
                  <strong>{label}</strong>
                  <span>{employee.role}</span>

                  <div className="employee-card-meta">
                    <span>
                      {status?.executionStatus ??
                        (language === "ar" ? "لا توجد محادثة" : "No conversation")}
                    </span>

                    {status?.workPlan && (
                      <span>
                        {status.workPlan.counts.done}/{status.workPlan.counts.total}
                      </span>
                    )}

                    {status?.cost && (
                      <span>${status.cost.accumulatedCost.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="project-summary-grid">
        <article className="project-summary-card">
          <small>{language === "ar" ? "التكلفة الإجمالية" : "Total project cost"}</small>
          <strong>{teamStatusLoading ? "…" : `$${totalProjectCost.toFixed(4)}`}</strong>
        </article>

        <article className="project-summary-card">
          <small>{language === "ar" ? "يعملون الآن" : "Working now"}</small>
          <strong>{teamStatusLoading ? "…" : workingCount}</strong>
        </article>

        <article className="project-summary-card">
          <small>{language === "ar" ? "المرحلة الحالية" : "Current gate"}</small>
          <strong>
            {workflowLoading ? "…" : workflow ? gateLabel(workflow.currentGate) : "—"}
          </strong>
        </article>
      </section>

      <section className="project-home-section workflow-overview">
        <div className="section-heading">
          <div>
            <small>MKDD Workflow</small>
            <h2>{language === "ar" ? "سير المشروع" : "Project workflow"}</h2>
          </div>
        </div>

        <div className="workflow-gates-grid">
          {GATES.map((gate) => {
            const gateState = workflow?.gates[gate];

            return (
              <article
                className={`workflow-status-card workflow-status-${gateState?.status ?? "unknown"}`}
                key={gate}
              >
                <small>{gateLabel(gate)}</small>
                <strong>{workflowLoading ? "…" : (gateState?.status ?? "—")}</strong>
              </article>
            );
          })}
        </div>

        <div className="section-heading workflow-subheading">
          <div>
            <small>Quality Gates</small>
            <h3>{language === "ar" ? "المراجعات الإلزامية" : "Mandatory reviews"}</h3>
          </div>
        </div>

        <div className="workflow-review-grid">
          {REVIEW_ROLES.map((reviewRole) => {
            const review = workflow?.reviews[reviewRole];

            return (
              <article
                className={`workflow-review-card workflow-review-${review?.status ?? "unknown"}`}
                key={reviewRole}
              >
                <small>{reviewLabel(reviewRole)}</small>
                <strong>{workflowLoading ? "…" : (review?.status ?? "—")}</strong>
                {review?.reviewedBy && <span>{review.reviewedBy}</span>}
              </article>
            );
          })}
        </div>

        <div className="workflow-summary-row">
          <article>
            <span>{language === "ar" ? "عوائق مفتوحة" : "Open blockers"}</span>
            <strong>{workflowLoading ? "…" : openBlockers}</strong>
          </article>

          <article>
            <span>{language === "ar" ? "ملاحظات غير مؤكدة" : "Unverified findings"}</span>
            <strong>{workflowLoading ? "…" : unverifiedFindings}</strong>
          </article>
        </div>
      </section>
    </main>
  );
}
