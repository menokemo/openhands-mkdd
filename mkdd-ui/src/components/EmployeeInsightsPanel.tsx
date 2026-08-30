import { useEffect, useState } from "react";
import { FaCircleInfo, FaRotate } from "react-icons/fa6";
import type {
  ActivityEvent,
  ConversationCost,
  ConversationExecutionStatus,
  WorkPlan,
} from "../types";
import WorkPlanPanel from "./WorkPlanPanel";
import { fetchEmployeeAutoResumeLog, type AutoResumeLogEntry } from "../api/client";
import { formatMessageTime } from "../utils/formatMessageTime";

type Props = {
  language: "ar" | "en";
  activity: ActivityEvent[];
  executionStatus: ConversationExecutionStatus | null;
  cost: ConversationCost | null;
  workPlan: WorkPlan | null;
  /**
   * The employee's CURRENTLY assigned LLM (BUGS_AND_FIXES.md #131) -
   * from the agent profile itself, not derived from the conversation's
   * cumulative usage stats (cost.modelName), which reflects whatever
   * model was in use when those stats accumulated and can silently go
   * stale if the model was changed afterward (e.g. from the OpenHands
   * UI) without a new conversation being started.
   */
  currentLlmProfileRef: string;
  /** Needed to look up this employee's auto-resume log (BUGS_AND_FIXES.md #176). */
  project: string;
  employeeId: string;
};

type TabKey = "cost" | "workplan" | "activity" | "autoResume";

const statusText = {
  ar: {
    idle: "جاهز",
    running: "يعمل الآن",
    paused: "متوقف مؤقتًا",
    waiting_for_confirmation: "بانتظار موافقتك",
    finished: "اكتمل",
    error: "خطأ",
    stuck: "متعثر",
    deleting: "جارٍ الحذف",
    unknown: "غير متاح",
  },
  en: {
    idle: "Ready",
    running: "Working",
    paused: "Paused",
    waiting_for_confirmation: "Waiting for approval",
    finished: "Finished",
    error: "Error",
    stuck: "Stuck",
    deleting: "Deleting",
    unknown: "Unavailable",
  },
} as const;

/**
 * Maps execution status to one of the shared status color categories
 * (matching the existing execution-status-dot-* classes) - used to
 * color both the trigger button and the modal's border, per the
 * owner's request that both reflect current employee activity at a
 * glance, not just the small dot that existed before.
 */
function statusColorClass(status: ConversationExecutionStatus | null): string {
  switch (status) {
    case "running":
      return "status-color-running";
    case "waiting_for_confirmation":
      return "status-color-waiting";
    case "paused":
      return "status-color-paused";
    case "error":
    case "stuck":
      return "status-color-danger";
    case "finished":
      return "status-color-finished";
    default:
      return "status-color-idle";
  }
}

function activityLabel(event: ActivityEvent, language: "ar" | "en") {
  if (event.kind === "ActionEvent") {
    return event.summary || event.tool_name || (language === "ar" ? "إجراء" : "Action");
  }

  if (event.kind === "ObservationEvent") {
    if (event.tool_name === "task_tracker") {
      return language === "ar" ? "تحديث خطة العمل" : "Work plan updated";
    }
    return event.tool_name
      ? language === "ar"
        ? `نتيجة ${event.tool_name}`
        : `${event.tool_name} result`
      : language === "ar"
        ? "نتيجة تنفيذ"
        : "Execution result";
  }

  if (event.kind === "AgentErrorEvent") {
    return event.error || (language === "ar" ? "خطأ في التنفيذ" : "Execution error");
  }

  if (event.kind === "PauseEvent") {
    return language === "ar" ? "تم إيقاف التنفيذ مؤقتًا" : "Execution paused";
  }

  if (event.kind === "InterruptEvent") {
    return language === "ar" ? "تمت مقاطعة التنفيذ" : "Execution interrupted";
  }

  if (event.kind === "UserRejectObservation") {
    return (
      event.rejection_reason || (language === "ar" ? "تم رفض الإجراء" : "Action rejected")
    );
  }

  if (event.kind === "HookExecutionEvent") {
    return (
      event.reason || (language === "ar" ? "فحص سياسة التنفيذ" : "Execution policy check")
    );
  }

  return language === "ar" ? "نشاط" : "Activity";
}

export default function EmployeeInsightsPanel({
  language,
  activity,
  executionStatus,
  cost,
  workPlan,
  currentLlmProfileRef,
  project,
  employeeId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("cost");
  const [autoResumeLog, setAutoResumeLog] = useState<AutoResumeLogEntry[] | null>(null);

  useEffect(() => {
    if (!open || activeTab !== "autoResume") return;
    let cancelled = false;
    fetchEmployeeAutoResumeLog(project, employeeId)
      .then((entries) => {
        if (!cancelled) setAutoResumeLog(entries);
      })
      .catch(() => {
        if (!cancelled) setAutoResumeLog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, project, employeeId]);

  const statusKey = executionStatus ?? "unknown";
  const colorClass = statusColorClass(executionStatus);
  const latestActivity = activity.slice(-30).reverse();
  const totalTokens = cost?.tokens
    ? cost.tokens.prompt +
      cost.tokens.completion +
      cost.tokens.cacheRead +
      cost.tokens.cacheWrite +
      cost.tokens.reasoning
    : null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "cost", label: language === "ar" ? "التكلفة" : "Cost" },
    { key: "workplan", label: language === "ar" ? "خطة العمل" : "Work Plan" },
    { key: "activity", label: language === "ar" ? "النشاط" : "Activity" },
    {
      key: "autoResume",
      label: language === "ar" ? "الاستئناف التلقائي" : "Auto-Resume",
    },
  ];

  return (
    <>
      <button
        type="button"
        className={`employee-details-button ${colorClass}`}
        onClick={() => setOpen(true)}
      >
        <FaCircleInfo />
        {language === "ar" ? "بيانات الموظف" : "Employee details"}
      </button>

      {open && (
        <div
          className="employee-insights-modal-backdrop"
          onClick={() => setOpen(false)}
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          <div
            className={`employee-insights-modal ${colorClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="employee-insights-modal-header">
              <span className={`employee-insights-modal-status ${colorClass}`}>
                {statusText[language][statusKey]}
              </span>
              <button
                type="button"
                className="employee-insights-modal-close"
                onClick={() => setOpen(false)}
                aria-label={language === "ar" ? "إغلاق" : "Close"}
              >
                ×
              </button>
            </div>

            <div className="employee-insights-modal-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`employee-insights-modal-tab ${
                    activeTab === tab.key ? "active" : ""
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="employee-insights-modal-body">
              {activeTab === "cost" && (
                <div className="employee-insights-cost-tab">
                  <strong>{cost ? `$${cost.accumulatedCost.toFixed(4)}` : "—"}</strong>
                  {totalTokens !== null && (
                    <span>
                      {totalTokens.toLocaleString()}{" "}
                      {language === "ar" ? "توكن" : "tokens"}
                    </span>
                  )}
                  {currentLlmProfileRef && (
                    <small>
                      {language === "ar" ? "النموذج" : "Model"}: {currentLlmProfileRef}
                    </small>
                  )}
                </div>
              )}

              {activeTab === "workplan" && (
                <WorkPlanPanel language={language} workPlan={workPlan} />
              )}

              {activeTab === "activity" && (
                <div className="activity-list">
                  {latestActivity.length === 0 ? (
                    <p className="activity-empty">
                      {language === "ar"
                        ? "لا يوجد نشاط مسجل حتى الآن."
                        : "No activity recorded yet."}
                    </p>
                  ) : (
                    latestActivity.map((event) => (
                      <article
                        className={`activity-item activity-${event.kind}`}
                        key={event.id}
                      >
                        <span className="activity-marker" aria-hidden="true" />
                        <div>
                          <strong>{activityLabel(event, language)}</strong>
                          {event.timestamp && <time>{event.timestamp}</time>}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}

              {activeTab === "autoResume" && (
                <div className="activity-list">
                  {autoResumeLog === null && (
                    <p className="activity-empty">
                      {language === "ar" ? "جاري التحميل..." : "Loading..."}
                    </p>
                  )}
                  {autoResumeLog?.length === 0 && (
                    <p className="activity-empty">
                      {language === "ar"
                        ? "لسه ماحصلش أي استئناف تلقائي لهذا الموظف."
                        : "No auto-resume events for this employee yet."}
                    </p>
                  )}
                  {autoResumeLog?.map((entry, i) => (
                    <article className="activity-item" key={`${entry.at}-${i}`}>
                      <FaRotate className="activity-marker" aria-hidden="true" />
                      <div>
                        <strong>
                          {language === "ar"
                            ? "رجع يشتغل تلقائيًا بعد ما حد الاستخدام انتهى"
                            : "Auto-resumed after the usage limit cleared"}
                        </strong>
                        <time>{formatMessageTime(entry.at, language)}</time>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
