import type { WorkPlan } from "../types";
import { FaSquareCheck, FaSquare, FaArrowsRotate } from "react-icons/fa6";

type Props = {
  language: "ar" | "en";
  workPlan: WorkPlan | null;
};

const statusLabel = {
  ar: {
    todo: "قيد الانتظار",
    in_progress: "قيد التنفيذ",
    done: "مكتمل",
  },
  en: {
    todo: "To do",
    in_progress: "In progress",
    done: "Done",
  },
} as const;

export default function WorkPlanPanel({ language, workPlan }: Props) {
  const title = language === "ar" ? "خطة العمل" : "Work Plan";
  const empty =
    language === "ar" ? "لا توجد خطة عمل مسجلة حتى الآن." : "No tracked work plan yet.";

  // BUGS_AND_FIXES.md #235: a real, clear checklist icon per status -
  // the owner explicitly asked for this to be an obvious checklist,
  // not a small ambiguous colored dot.
  function TaskIcon({ status }: { status: "todo" | "in_progress" | "done" }) {
    if (status === "done") return <FaSquareCheck className="work-plan-task-icon" />;
    if (status === "in_progress")
      return <FaArrowsRotate className="work-plan-task-icon" />;
    return <FaSquare className="work-plan-task-icon" />;
  }

  if (!workPlan) {
    return (
      <section className="work-plan-panel" dir={language === "ar" ? "rtl" : "ltr"}>
        <div className="work-plan-heading">
          <strong>{title}</strong>
        </div>
        <p className="work-plan-empty">{empty}</p>
      </section>
    );
  }

  return (
    <details
      className="work-plan-panel work-plan-drawer"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <summary className="work-plan-heading">
        <div>
          <strong>{title}</strong>
          <small>
            {workPlan.counts.done}/{workPlan.counts.total}{" "}
            {language === "ar" ? "مهام مكتملة" : "tasks completed"}
          </small>
        </div>
        <span>{workPlan.progressPercent}%</span>
      </summary>

      <div
        className="work-plan-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={workPlan.progressPercent}
      >
        <div style={{ width: `${workPlan.progressPercent}%` }} />
      </div>

      <div className="work-plan-tasks">
        {workPlan.tasks.map((task, index) => (
          <article
            className={`work-plan-task ${task.status}`}
            key={`${task.title}-${index}`}
          >
            <TaskIcon status={task.status} />
            <div>
              <strong>{task.title}</strong>
              {task.notes && <p>{task.notes}</p>}
              <small>{statusLabel[language][task.status]}</small>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
