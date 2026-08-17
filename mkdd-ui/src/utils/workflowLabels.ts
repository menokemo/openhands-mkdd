import type { WorkflowGateName, WorkflowReviewRole } from "../api/client";

export const GATES: WorkflowGateName[] = [
  "requirements",
  "ui_ux",
  "architecture",
  "production",
];

export const REVIEW_ROLES: WorkflowReviewRole[] = [
  "qa",
  "test_automation",
  "code_review",
  "security_review",
];

const GATE_LABELS: Record<"ar" | "en", Record<WorkflowGateName, string>> = {
  ar: {
    requirements: "المتطلبات",
    ui_ux: "واجهة وتجربة المستخدم",
    architecture: "المعمارية",
    production: "الإنتاج",
  },
  en: {
    requirements: "Requirements",
    ui_ux: "UI/UX",
    architecture: "Architecture",
    production: "Production",
  },
};

const REVIEW_LABELS: Record<"ar" | "en", Record<WorkflowReviewRole, string>> = {
  ar: {
    qa: "QA",
    test_automation: "الاختبارات الآلية",
    code_review: "مراجعة الكود",
    security_review: "مراجعة الأمان",
  },
  en: {
    qa: "QA",
    test_automation: "Test Automation",
    code_review: "Code Review",
    security_review: "Security Review",
  },
};

const REVIEW_STATUS_LABELS: Record<"ar" | "en", Record<string, string>> = {
  ar: {
    pending: "قيد الانتظار",
    complete: "مكتملة",
  },
  en: {
    pending: "Pending",
    complete: "Complete",
  },
};

export function getGateLabel(gate: WorkflowGateName, language: "ar" | "en"): string {
  return GATE_LABELS[language][gate];
}

export function getReviewLabel(role: WorkflowReviewRole, language: "ar" | "en"): string {
  return REVIEW_LABELS[language][role];
}

/**
 * Review status only ever has two real persisted values (see
 * server/routes/workflow.mjs's handleReviews: "pending" or "complete")
 * - translates them instead of showing the raw English status string
 * regardless of the UI's current language.
 */
export function getReviewStatusLabel(
  status: string | undefined,
  language: "ar" | "en",
): string {
  if (!status) return "—";
  return REVIEW_STATUS_LABELS[language][status] ?? status;
}
