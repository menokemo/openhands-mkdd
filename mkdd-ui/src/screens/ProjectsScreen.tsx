import { useState } from "react";
import type { Workspace } from "../types";

type Props = {
  projects: Workspace[];
  loading: boolean;
  language: "ar" | "en";
  t: {
    projects: string;
    language: string;
    loadingProjects: string;
    noProjects: string;
    newProject: string;
    newProjectTitle: string;
    newProjectNamePlaceholder: string;
    newProjectNameHint: string;
    create: string;
    cancel: string;
    creatingProject: string;
    projectCreationFailed: string;
  };
  setLanguage: (language: "ar" | "en") => void;
  onOpenProject: (project: Workspace) => void;
  onCreateProject: (name: string) => Promise<void>;
};

export default function ProjectsScreen({
  projects,
  loading,
  language,
  t,
  setLanguage,
  onOpenProject,
  onCreateProject,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeModal = () => {
    setIsCreating(false);
    setNewProjectName("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await onCreateProject(newProjectName.trim());
      closeModal();
    } catch {
      setError(t.projectCreationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app projects-screen">
      <header className="brand-header">
        <div className="brand">
          <img src="/api/branding/logo" alt="MKDD" />

          <div>
            <h1>MKDD</h1>
            <small>{language === "ar" ? "تصميم وتطوير" : "Design & Development"}</small>
          </div>
        </div>

        <button
          className="lang-toggle"
          onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
        >
          {t.language}
        </button>
      </header>

      <div className="section-label">{t.projects}</div>

      <section className="chat">
        {loading && (
          <article>
            <p>{t.loadingProjects}</p>
          </article>
        )}

        {!loading && projects.length === 0 && (
          <article>
            <p>{t.noProjects}</p>
          </article>
        )}

        {projects.map((project) => (
          <article
            className="project-card"
            key={project.id}
            onClick={() => onOpenProject(project)}
          >
            <b>{project.name}</b>
            <p>{project.path}</p>
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
