import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaRotate } from "react-icons/fa6";
import type {
  ActivityEvent,
  ConversationCost,
  ConversationExecutionStatus,
  WorkPlan,
} from "../types";
import WorkPlanPanel from "./WorkPlanPanel";
import { fetchEmployeeAutoResumeLog, type AutoResumeLogEntry } from "../api/client";
import { statusColorClass, getStatusText } from "../utils/employeeStatusColor";
import { ROLE_ICONS } from "../utils/roleIcons";
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
  // BUGS_AND_FIXES.md #221: the header now shows only avatar+name+back,
  // moving the role, status, and "new conversation" action into this
  // panel's profile section instead - opened by tapping the avatar.
  employeeName?: string;
  employeeRole?: string;
  employeeAvatarUrl?: string;
  onStartNewConversation?: () => void;
  /** Externally controlled open state (avatar tap in the header) -
   * falls back to fully internal state if not provided. */
  openOverride?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type TabKey = "cost" | "workplan" | "activity" | "autoResume";

/**
 * Maps execution status to one of the shared status color categories
 * (matching the existing execution-status-dot-* classes) - used to
 * color both the trigger button and the modal's border, per the
 * owner's request that both reflect current employee activity at a
 * glance, not just the small dot that existed before.
 */

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
  employeeName,
  employeeRole,
  employeeAvatarUrl,
  onStartNewConversation,
  openOverride,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openOverride ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
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
      {open &&
        createPortal(
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
                  {getStatusText(executionStatus, language)}
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

              {/* BUGS_AND_FIXES.md #221: employee profile - name/role/
                avatar/new-conversation, moved here from the header. */}
              {employeeName && (
                <div className="employee-insights-profile">
                  <div className="employee-insights-profile-avatar">
                    {employeeAvatarUrl ? (
                      <img src={employeeAvatarUrl} alt={employeeName} />
                    ) : (
                      employeeName.slice(0, 1)
                    )}
                  </div>
                  <strong>{employeeName}</strong>
                  {employeeRole && (
                    <span className="employee-insights-profile-role">
                      {(() => {
                        const RoleIcon = ROLE_ICONS[employeeId];
                        return RoleIcon ? <RoleIcon /> : null;
                      })()}
                      {employeeRole}
                    </span>
                  )}
                  {onStartNewConversation && (
                    <button
                      type="button"
                      className="employee-insights-profile-new-conv"
                      onClick={onStartNewConversation}
                    >
                      {language === "ar" ? "محادثة جديدة" : "New conversation"}
                    </button>
                  )}
                </div>
              )}

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
          </div>,
          document.body,
        )}
    </>
  );
}
