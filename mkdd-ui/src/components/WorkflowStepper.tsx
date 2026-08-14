import { FaCheck } from "react-icons/fa6";
import type { WorkflowState } from "../api/client";
import { GATES, getGateLabel } from "../utils/workflowLabels";

type Props = {
  workflow: WorkflowState | null;
  loading: boolean;
  language: "ar" | "en";
};

const STATUS_LABELS = {
  ar: { approved: "معتمدة", inProgress: "قيد التنفيذ", pending: "قيد الانتظار" },
  en: { approved: "Approved", inProgress: "In Progress", pending: "Pending" },
} as const;

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
export default function WorkflowStepper({ workflow, loading, language }: Props) {
  const t = STATUS_LABELS[language];

  return (
    <div className="workflow-stepper" aria-busy={loading}>
      {GATES.map((gate, index) => {
        const gateState = workflow?.gates[gate];
        const isApproved = gateState?.status === "approved";
        const isCurrent = !isApproved && workflow?.currentGate === gate;
        const stepStatus = isApproved ? "approved" : isCurrent ? "current" : "pending";

        return (
          <div className={`workflow-step workflow-step-${stepStatus}`} key={gate}>
            <div className="workflow-step-row">
              <div className="workflow-step-circle">
                {isApproved ? <FaCheck /> : index + 1}
              </div>

              {index < GATES.length - 1 && (
                <div
                  className={`workflow-step-line${isApproved ? " workflow-step-line-done" : ""}`}
                />
              )}
            </div>

            <div className="workflow-step-label">
              <strong>{getGateLabel(gate, language)}</strong>
              <span>
                {loading
                  ? "…"
                  : isApproved
                    ? t.approved
                    : isCurrent
                      ? t.inProgress
                      : t.pending}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
