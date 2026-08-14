import type { Workspace } from "../types";

type Props = {
  title: string;
  projects: Workspace[];
  language: "ar" | "en";
  onOpenProject: (project: Workspace) => void;
  onClose: () => void;
};

/**
 * The actual project list for one sidebar category (active / near-
 * completion / completed). Opened from Sidebar.tsx, which itself never
 * renders project data directly - this popup is where that data lives.
 */
export default function ProjectListModal({
  title,
  projects,
  language,
  onOpenProject,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal list-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {projects.length === 0 && (
          <p className="modal-hint">{language === "ar" ? "لا يوجد" : "None"}</p>
        )}

        <div className="list-modal-items">
          {projects.map((project) => (
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
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {language === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
