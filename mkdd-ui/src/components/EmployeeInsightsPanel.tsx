import type {
  ActivityEvent,
  ConversationCost,
  ConversationExecutionStatus,
  WorkPlan,
} from "../types";
import WorkPlanPanel from "./WorkPlanPanel";

type Props = {
  language: "ar" | "en";
  activity: ActivityEvent[];
  executionStatus: ConversationExecutionStatus | null;
  cost: ConversationCost | null;
  workPlan: WorkPlan | null;
};

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
    return event.rejection_reason ||
      (language === "ar" ? "تم رفض الإجراء" : "Action rejected");
  }

  if (event.kind === "HookExecutionEvent") {
    return event.reason ||
      (language === "ar" ? "فحص سياسة التنفيذ" : "Execution policy check");
  }

  return language === "ar" ? "نشاط" : "Activity";
}

export default function EmployeeInsightsPanel({
  language,
  activity,
  executionStatus,
  cost,
  workPlan,
}: Props) {
  const statusKey = executionStatus ?? "unknown";
  const latestActivity = activity.slice(-8).reverse();
  const totalTokens = cost?.tokens
    ? cost.tokens.prompt +
      cost.tokens.completion +
      cost.tokens.cacheRead +
      cost.tokens.cacheWrite +
      cost.tokens.reasoning
    : null;

  return (
    <details
      className="employee-insights employee-insights-drawer"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <summary className="employee-insights-trigger">
        <span>{language === "ar" ? "تفاصيل الموظف والنشاط" : "Employee details & activity"}</span>
        <span className={`execution-status-dot execution-status-dot-${statusKey}`} aria-hidden="true" />
      </summary>

      <div className="employee-insights-content">
      <div className="employee-insights-summary">
        <div className={`execution-status execution-status-${statusKey}`}>
          <span className="execution-status-dot" aria-hidden="true" />
          <div>
            <small>{language === "ar" ? "الحالة" : "Status"}</small>
            <strong>{statusText[language][statusKey]}</strong>
          </div>
        </div>

        <div className="conversation-cost">
          <small>{language === "ar" ? "التكلفة" : "Cost"}</small>
          <strong>
            {cost ? `$${cost.accumulatedCost.toFixed(4)}` : "—"}
          </strong>
          {totalTokens !== null && (
            <span>
              {totalTokens.toLocaleString()}{" "}
              {language === "ar" ? "توكن" : "tokens"}
            </span>
          )}
        </div>
      </div>

      <WorkPlanPanel language={language} workPlan={workPlan} />

      <section className="activity-drawer">
        <div className="activity-heading">
          <span>{language === "ar" ? "النشاط" : "Activity"}</span>
          <small>{activity.length}</small>
        </div>

        <div className="activity-list">
          {latestActivity.length === 0 ? (
            <p className="activity-empty">
              {language === "ar"
                ? "لا يوجد نشاط مسجل حتى الآن."
                : "No activity recorded yet."}
            </p>
          ) : (
            latestActivity.map((event) => (
              <article className={`activity-item activity-${event.kind}`} key={event.id}>
                <span className="activity-marker" aria-hidden="true" />
                <div>
                  <strong>{activityLabel(event, language)}</strong>
                  {event.timestamp && <time>{event.timestamp}</time>}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      </div>
    </details>
  );
}
