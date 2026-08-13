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
  };
  setLanguage: (language: "ar" | "en") => void;
  onOpenProject: (project: Workspace) => void;
};

export default function ProjectsScreen({
  projects,
  loading,
  language,
  t,
  setLanguage,
  onOpenProject,
}: Props) {
  return (
    <main className="app">
      <header>
        <div>
          <div className="brand">
            <img src="/api/branding/logo" alt="MKDD" />

            <div>
              <small>MKDD</small>
              <h1>{t.projects}</h1>
            </div>
          </div>
        </div>

        <button
          onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
        >
          {t.language}
        </button>
      </header>

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
    </main>
  );
}
