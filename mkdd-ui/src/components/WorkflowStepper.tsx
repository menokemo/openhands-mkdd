import { useState } from "react";
import {
  FaCheck,
  FaClipboardList,
  FaPalette,
  FaCompassDrafting,
  FaRocket,
  FaXmark,
  FaCircleCheck,
  FaCircleXmark,
  FaLock,
} from "react-icons/fa6";
import type { AgentProfile, Workspace } from "../types";
import type { WorkflowState } from "../api/client";
import { closeWorkflowReport } from "../api/client";
import { GATES, getGateLabel } from "../utils/workflowLabels";
import type { WorkflowGateName } from "../api/client";

type Props = {
  workflow: WorkflowState | null;
  loading: boolean;
  language: "ar" | "en";
  project: Workspace;
  employees: AgentProfile[];
  onWorkflowChange: (workflow: WorkflowState) => void;
};

const STATUS_LABELS = {
  ar: { approved: "معتمدة", inProgress: "قيد التنفيذ", pending: "قيد الانتظار" },
  en: { approved: "Approved", inProgress: "In Progress", pending: "Pending" },
} as const;

const REPORT_STATUS_LABELS = {
  ar: {
    open: "بانتظار رد الموظف",
    implemented: "تم التنفيذ",
    declined: "تم الرفض",
    closed: "مغلق",
  },
  en: {
    open: "Awaiting employee response",
    implemented: "Implemented",
    declined: "Declined",
    closed: "Closed",
  },
} as const;

const GATE_ICONS: Record<
  WorkflowGateName,
  React.ComponentType<{ className?: string }>
> = {
  requirements: FaClipboardList,
  ui_ux: FaPalette,
  architecture: FaCompassDrafting,
  production: FaRocket,
};

// Four genuinely distinct hues (not shades of the same blue - see
// BUGS_AND_FIXES.md #83, where the earlier accent/accent-deep/accent-soft
// scheme looked "almost the same color" to the eye). Set as a single CSS
// custom property consumed by BOTH the gate icon and the pending-state
// circle border/number, guaranteeing they always match exactly since
// they read the same source value rather than two separately-picked
// colors that could drift apart.
const GATE_COLOR_VARS: Record<WorkflowGateName, string> = {
  requirements: "var(--mkdd-accent)",
  ui_ux: "var(--mkdd-danger)",
  architecture: "var(--mkdd-warning)",
  production: "var(--mkdd-success)",
};

/**
 * Builds one continuous connecting-line gradient spanning exactly from
 * the first circle's center to the last circle's center - the
 * .workflow-stepper-connector element itself is positioned to match
 * that same range (see App.css), so these percentages are relative to
 * the CONNECTOR'S OWN length, not the full stepper width. Two separate
 * per-step absolutely-positioned segment attempts (BUGS_AND_FIXES.md
 * #83/#84) failed because a segment confined to one grid column's own
 * coordinate space can't reliably reach into a neighboring column's
 * circle - one continuous element with a precomputed gradient sidesteps
 * that entirely.
 *
 * With N equal-width columns, circle i's center sits at
 * ((i + 0.5) / N) * 100% of the TOTAL stepper width. Converted to the
 * connector's own local 0-100% range (which spans from circle 0's
 * center to circle N-1's center): local% = (global% - firstCenter%) /
 * (lastCenter% - firstCenter%) * 100. Each segment between two adjacent
 * circles is split into two hard-stop halves - the left half takes the
 * left gate's color, the right half takes the right gate's color - per
 * explicit product direction.
 */
function buildConnectorGradient(
  gates: readonly WorkflowGateName[],
  language: "ar" | "en",
): string {
  const n = gates.length;
  const firstCenter = (0.5 / n) * 100;
  const lastCenter = ((n - 1 + 0.5) / n) * 100;
  const span = lastCenter - firstCenter;
  const toLocal = (globalPercent: number) => ((globalPercent - firstCenter) / span) * 100;

  const stops: string[] = [];

  for (let i = 0; i < n - 1; i++) {
    const leftCenter = toLocal(((i + 0.5) / n) * 100);
    const rightCenter = toLocal(((i + 1.5) / n) * 100);
    const midpoint = (leftCenter + rightCenter) / 2;
    const leftColor = GATE_COLOR_VARS[gates[i]];
    const rightColor = GATE_COLOR_VARS[gates[i + 1]];

    stops.push(`${leftColor} ${leftCenter}%`);
    stops.push(`${leftColor} ${midpoint}%`);
    stops.push(`${rightColor} ${midpoint}%`);
    stops.push(`${rightColor} ${rightCenter}%`);
  }

  // document.documentElement.dir switches to "ltr" for English (see
  // useLanguage.ts), which mirrors the whole grid so the first gate
  // sits on the LEFT instead of the RIGHT. linear-gradient() always
  // uses fixed physical directions regardless of dir, so the direction
  // itself must flip to match which side gate 0 actually renders on.
  const direction = language === "ar" ? "to left" : "to right";

  return `linear-gradient(${direction}, ${stops.join(", ")})`;
}

/**
 * The numbered gate-progression stepper (matches the reference design's
 * "Workflow Overview": circled gate numbers, a checkmark once approved,
 * a connecting line between steps that fills in as gates are approved).
 *
 * One component, styled responsively for both mobile and desktop via CSS
 * (see .workflow-stepper rules in App.css) rather than two separate
 * implementations, per explicit product direction.
 *
 * Status per gate is read directly from real persisted workflow data
 * (never fabricated, per README section 47 / ENGINEERING_PRINCIPLES.md):
 *   - approved: workflow.gates[gate].status === "approved"
 *   - current: workflow.currentGate === gate (and not yet approved)
 *   - pending: anything else (not yet reached)
 */
export default function WorkflowStepper({
  workflow,
  loading,
  language,
  project,
  employees,
  onWorkflowChange,
}: Props) {
  const t = STATUS_LABELS[language];
  const rt = REPORT_STATUS_LABELS[language];
  const connectorGradient = buildConnectorGradient(GATES, language);
  const [openGate, setOpenGate] = useState<WorkflowGateName | null>(null);
  const [closingReportId, setClosingReportId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  function employeeName(employeeId: string): string {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return employeeId;
    const name = language === "ar" ? employee.displayNameAr : employee.displayNameEn;
    return name ?? employee.name;
  }

  async function handleCloseReport(reportId: string) {
    setClosingReportId(reportId);
    setCloseError(null);
    try {
      const next = await closeWorkflowReport(project.path, reportId);
      onWorkflowChange(next);
    } catch {
      setCloseError(
        language === "ar"
          ? "فشل قفل التقرير، حاول تاني"
          : "Failed to close the report, try again",
      );
    } finally {
      setClosingReportId(null);
    }
  }

  const gateReports = openGate
    ? (workflow?.reports.filter((r) => r.gate === openGate) ?? [])
    : [];

  return (
    <div className="workflow-stepper" aria-busy={loading}>
      <div className="workflow-stepper-circles">
        <div
          className="workflow-stepper-connector"
          style={{ background: connectorGradient }}
        />

        {GATES.map((gate) => {
          const gateState = workflow?.gates[gate];
          const isApproved = gateState?.status === "approved";
          const isCurrent = !isApproved && workflow?.currentGate === gate;
          const stepStatus = isApproved ? "approved" : isCurrent ? "current" : "pending";

          return (
            <div
              className={`workflow-step-circle-slot workflow-step-${stepStatus}`}
              key={gate}
              style={{ "--gate-color": GATE_COLOR_VARS[gate] } as React.CSSProperties}
            >
              <div className="workflow-step-circle">
                {isApproved ? <FaCheck /> : GATES.indexOf(gate) + 1}
              </div>
            </div>
          );
        })}
      </div>

      <div className="workflow-stepper-labels">
        {GATES.map((gate) => {
          const gateState = workflow?.gates[gate];
          const isApproved = gateState?.status === "approved";
          const isCurrent = !isApproved && workflow?.currentGate === gate;
          const stepStatus = isApproved ? "approved" : isCurrent ? "current" : "pending";
          const GateIcon = GATE_ICONS[gate];
          const reportCount =
            workflow?.reports.filter((r) => r.gate === gate && r.status !== "closed")
              .length ?? 0;

          return (
            <button
              type="button"
              className={`workflow-step-label workflow-step-${stepStatus}`}
              key={gate}
              style={{ "--gate-color": GATE_COLOR_VARS[gate] } as React.CSSProperties}
              onClick={() => setOpenGate(gate)}
            >
              <strong>
                <GateIcon />
                {getGateLabel(gate, language)}
                {reportCount > 0 && (
                  <span className="workflow-step-report-count">{reportCount}</span>
                )}
              </strong>
              <span>
                {loading
                  ? "…"
                  : isApproved
                    ? t.approved
                    : isCurrent
                      ? t.inProgress
                      : t.pending}
              </span>
            </button>
          );
        })}
      </div>

      {openGate && (
        <div className="modal-backdrop" onClick={() => setOpenGate(null)}>
          <div className="modal gate-reports-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gate-reports-modal-header">
              <h2>{getGateLabel(openGate, language)}</h2>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setOpenGate(null)}
                aria-label={language === "ar" ? "إغلاق" : "Close"}
              >
                <FaXmark />
              </button>
            </div>

            {closeError && <p className="modal-error">{closeError}</p>}

            {gateReports.length === 0 ? (
              <p className="gate-reports-empty">
                {language === "ar"
                  ? "لا توجد تقارير لهذه المرحلة."
                  : "No reports for this stage."}
              </p>
            ) : (
              <ul className="gate-reports-list">
                {gateReports.map((report) => (
                  <li
                    className={`gate-report-card gate-report-${report.status}`}
                    key={report.id}
                  >
                    <div className="gate-report-parties">
                      <strong>{employeeName(report.fromEmployeeId)}</strong>
                      <span className="gate-report-arrow">
                        {language === "ar" ? "←" : "→"}
                      </span>
                      <strong>{employeeName(report.toEmployeeId)}</strong>
                    </div>

                    <p className="gate-report-title">{report.title}</p>

                    {report.details && (
                      <p className="gate-report-details">{report.details}</p>
                    )}

                    <div
                      className={`gate-report-status gate-report-status-${report.status}`}
                    >
                      {report.status === "implemented" && <FaCircleCheck />}
                      {report.status === "declined" && <FaCircleXmark />}
                      {report.status === "closed" && <FaLock />}
                      {rt[report.status]}
                    </div>

                    {report.note && <p className="gate-report-note">{report.note}</p>}

                    {(report.status === "implemented" ||
                      report.status === "declined") && (
                      <button
                        type="button"
                        className="gate-report-close-button"
                        disabled={closingReportId === report.id}
                        onClick={() => handleCloseReport(report.id)}
                      >
                        {closingReportId === report.id
                          ? "…"
                          : language === "ar"
                            ? "قفل نهائي"
                            : "Close"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
