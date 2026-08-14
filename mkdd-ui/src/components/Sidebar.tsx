import type { AgentProfile, Workspace } from "../types";
import type { WorkflowSummary } from "../api/client";
import { groupProjectsByGateStatus } from "../utils/projectGateStatus";

type Props = {
  open: boolean;
  language: "ar" | "en";
  projects: Workspace[];
  workflowSummaries: Record<string, WorkflowSummary>;
  employees: AgentProfile[];
  onClose: () => void;
  onOpenProject: (project: Workspace) => void;
  onOpenEmployeeProfile: (employee: AgentProfile) => void;
};

const LABELS = {
  ar: {
    active: "المشاريع الحالية",
    nearCompletion: "قربت تخلص",
    completed: "خلصت",
    employees: "الموظفين",
    noProjects: "لا يوجد",
  },
  en: {
    active: "Active Projects",
    nearCompletion: "Near Completion",
    completed: "Completed",
    employees: "Employees",
    noProjects: "None",
  },
} as const;

export default function Sidebar({
  open,
  language,
  projects,
  workflowSummaries,
  employees,
  onClose,
  onOpenProject,
  onOpenEmployeeProfile,
}: Props) {
  if (!open) return null;

  const t = LABELS[language];
  const groups = groupProjectsByGateStatus(projects, workflowSummaries);

  const renderProjectGroup = (title: string, items: Workspace[]) => (
    <section className="sidebar-section">
      <h3>{title}</h3>
      {items.length === 0 && <p className="sidebar-empty">{t.noProjects}</p>}
      {items.map((project) => (
        <button
          key={project.id}
          className="sidebar-item"
          style={{ borderInlineStartColor: project.color ?? "#7c6bff" }}
          onClick={() => {
            onOpenProject(project);
            onClose();
          }}
        >
          {project.name}
        </button>
      ))}
    </section>
  );

  return (
    <div className="sidebar-backdrop" onClick={onClose}>
      <aside
        className="sidebar"
        dir={language === "ar" ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="sidebar-close"
          onClick={onClose}
          aria-label={language === "ar" ? "إغلاق" : "Close"}
        >
          ✕
        </button>

        {renderProjectGroup(t.active, groups.active)}
        {renderProjectGroup(t.nearCompletion, groups.nearCompletion)}
        {renderProjectGroup(t.completed, groups.completed)}

        <section className="sidebar-section">
          <h3>{t.employees}</h3>
          <div className="sidebar-employee-list">
            {employees.map((employee) => {
              const label =
                language === "ar" ? employee.displayNameAr : employee.displayNameEn;

              return (
                <button
                  key={employee.id}
                  className="sidebar-employee"
                  onClick={() => {
                    onOpenEmployeeProfile(employee);
                    onClose();
                  }}
                >
                  <span className="sidebar-employee-avatar">
                    {employee.avatarUrl ? (
                      <img src={employee.avatarUrl} alt={label ?? employee.name} />
                    ) : (
                      (label?.slice(0, 1) ?? "?")
                    )}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
  );
}
