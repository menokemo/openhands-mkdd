import { useState } from "react";
import { FaDesktop } from "react-icons/fa6";
import type { AgentProfile, Workspace } from "../types";
import { getGateLabel } from "../utils/workflowLabels";
import { formatRelativeTime } from "../utils/formatRelativeTime";

// Must match server/lib/project-metadata.mjs's ALLOWED_COLORS exactly -
// the backend rejects any color not in this list, falling back silently
// to the default rather than erroring, so keeping these in sync avoids a
// confusing "I picked purple but it saved as default" experience.
const PROJECT_COLORS = ["#7c6bff", "#5c9eff", "#3ecf8e", "#f5a524", "#f5618b", "#8d95aa"];

// How many team avatars show before collapsing into "+N" - matches the
// reference design's compact stack.
const VISIBLE_AVATAR_COUNT = 3;

type Props = {
  projects: Workspace[];
  employees: AgentProfile[];
  loading: boolean;
  language: "ar" | "en";
  t: {
    projects: string;
    loadingProjects: string;
    noProjects: string;
    newProject: string;
    newProjectTitle: string;
    newProjectNamePlaceholder: string;
    newProjectNameHint: string;
    newProjectColorLabel: string;
    create: string;
    cancel: string;
    creatingProject: string;
    projectCreationFailed: string;
  };
  onOpenProject: (project: Workspace) => void;
  onCreateProject: (name: string, color: string) => Promise<void>;
};

/**
 * Body content for the Projects screen (list + "new project" flow).
 * The header lives in AppHeader (rendered once by App.tsx, identical on
 * every screen) - this component only owns what's specific to this page.
 */
export default function ProjectsScreen({
  projects,
  employees,
  loading,
  language,
  t,
  onOpenProject,
  onCreateProject,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeModal = () => {
    setIsCreating(false);
    setNewProjectName("");
    setNewProjectColor(PROJECT_COLORS[0]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await onCreateProject(newProjectName.trim(), newProjectColor);
      closeModal();
    } catch {
      setError(t.projectCreationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const visibleAvatars = employees.slice(0, VISIBLE_AVATAR_COUNT);
  const hiddenAvatarCount = employees.length - visibleAvatars.length;

  return (
    <main className="app projects-screen">
      <div className="section-label">{t.projects}</div>

      <section className="project-list">
        {loading && (
          <article className="project-list-status">
            <p>{t.loadingProjects}</p>
          </article>
        )}

        {!loading && projects.length === 0 && (
          <article className="project-list-status">
            <p>{t.noProjects}</p>
          </article>
        )}

        {projects.map((project) => (
          <article
            className="project-card-v2"
            key={project.id}
            onClick={() => onOpenProject(project)}
          >
            <div
              className="project-card-icon"
              style={{ color: project.color ?? PROJECT_COLORS[0] }}
            >
              <FaDesktop />
            </div>

            <div className="project-card-body">
              <strong>{project.name}</strong>
              <span className="project-card-meta">
                {language === "ar" ? "مساحة عمل" : "Workspace"}
                {project.lastActivityAt && (
                  <>
                    {" "}
                    • {language === "ar" ? "آخر تحديث" : "Updated"}{" "}
                    {formatRelativeTime(project.lastActivityAt, language)}
                  </>
                )}
              </span>

              <span
                className="project-card-gate"
                style={{ color: project.color ?? PROJECT_COLORS[0] }}
              >
                {getGateLabel(project.currentGate ?? "requirements", language)}
              </span>

              {employees.length > 0 && (
                <div className="project-card-avatars">
                  {visibleAvatars.map((employee) => {
                    const label =
                      language === "ar"
                        ? (employee.displayNameAr ?? employee.name)
                        : (employee.displayNameEn ?? employee.name);
                    return (
                      <div className="project-card-avatar" key={employee.id}>
                        {employee.avatarUrl ? (
                          <img src={employee.avatarUrl} alt={label} />
                        ) : (
                          label.slice(0, 1)
                        )}
                      </div>
                    );
                  })}
                  {hiddenAvatarCount > 0 && (
                    <div className="project-card-avatar project-card-avatar-more">
                      +{hiddenAvatarCount}
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <div className="new-project-bar">
        <button className="new-project-button" onClick={() => setIsCreating(true)}>
          {t.newProject}
        </button>
      </div>

      {isCreating && (
        <div className="modal-backdrop" onClick={closeModal}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h2>{t.newProjectTitle}</h2>

            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={t.newProjectNamePlaceholder}
              autoFocus
              disabled={submitting}
            />
            <p className="modal-hint">{t.newProjectNameHint}</p>

            <p className="modal-color-label">{t.newProjectColorLabel}</p>
            <div className="color-swatch-row">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-swatch${color === newProjectColor ? " selected" : ""}`}
                  style={{ background: color }}
                  aria-label={color}
                  disabled={submitting}
                  onClick={() => setNewProjectColor(color)}
                />
              ))}
            </div>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" onClick={closeModal} disabled={submitting}>
                {t.cancel}
              </button>
              <button type="submit" disabled={submitting || !newProjectName.trim()}>
                {submitting ? t.creatingProject : t.create}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
