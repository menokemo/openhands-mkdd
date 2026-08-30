import { useEffect, useState } from "react";
import { FaCodeBranch, FaCircleCheck, FaCircleExclamation } from "react-icons/fa6";
import { fetchProjectGitInfo, type ProjectGitInfo } from "../api/client";
import { formatMessageTime } from "../utils/formatMessageTime";
import ProjectCommitHistoryModal from "./ProjectCommitHistoryModal";

type Props = {
  projectPath: string;
  language: "ar" | "en";
};

/**
 * Shows real repo info on the project home page (BUGS_AND_FIXES.md
 * #166) - the repo name (from local .git/config), clean/dirty status,
 * and recent commits, all sourced from real local git data (no
 * fabricated GitHub PR/CI status - see the backend endpoint for why).
 *
 * Last-known-good on refresh: a failed background refresh keeps
 * showing the previous result rather than blanking the card, matching
 * the rest of the app's data stability principle.
 */
export default function ProjectGitInfoCard({ projectPath, language }: Props) {
  const [info, setInfo] = useState<ProjectGitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetchProjectGitInfo(projectPath)
        .then((data) => {
          if (cancelled) return;
          setInfo(data);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const interval = setInterval(load, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectPath]);

  const t =
    language === "ar"
      ? {
          title: "مستودع الكود",
          noRepo: "لسه معملش ربط بمستودع Git.",
          clean: "كل التعديلات محفوظة (Commits)",
          dirtyOne: "تعديل واحد لسه مش محفوظ",
          dirtyMany: (n: number) => `${n} تعديلات لسه مش محفوظة`,
          recentCommits: "آخر التعديلات",
          noCommits: "لسه مفيش أي Commit.",
          viewAll: "شوف الكل",
        }
      : {
          title: "Code Repository",
          noRepo: "Not linked to a Git repository yet.",
          clean: "All changes committed",
          dirtyOne: "1 uncommitted change",
          dirtyMany: (n: number) => `${n} uncommitted changes`,
          recentCommits: "Recent commits",
          noCommits: "No commits yet.",
          viewAll: "View all",
        };

  if (loading && !info) return null;
  if (!info) return null;

  const repoName = info.repoUrl
    ? info.repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "")
    : null;

  return (
    <>
      <section className="project-home-section project-git-info-section">
        <div className="section-heading">
          <h2>
            <FaCodeBranch className="section-heading-icon" />
            {t.title}
          </h2>
        </div>

        {!repoName && <p className="project-git-info-empty">{t.noRepo}</p>}

        {repoName && (
          <>
            <div className="project-git-info-summary">
              <a
                href={info.repoUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="project-git-info-repo-link"
              >
                {repoName}
              </a>
              {info.uncommittedChanges !== null && (
                <span
                  className={
                    info.uncommittedChanges === 0
                      ? "project-git-info-status project-git-info-clean"
                      : "project-git-info-status project-git-info-dirty"
                  }
                >
                  {info.uncommittedChanges === 0 && <FaCircleCheck />}
                  {info.uncommittedChanges > 0 && <FaCircleExclamation />}
                  {info.uncommittedChanges === 0 && t.clean}
                  {info.uncommittedChanges === 1 && t.dirtyOne}
                  {info.uncommittedChanges > 1 && t.dirtyMany(info.uncommittedChanges)}
                </span>
              )}
            </div>

            <div className="project-git-info-commits-heading">
              <h3 className="project-git-info-commits-title">{t.recentCommits}</h3>
              {info.commits.length > 0 && (
                <button
                  type="button"
                  className="project-git-info-view-all"
                  onClick={() => setHistoryOpen(true)}
                >
                  {t.viewAll}
                </button>
              )}
            </div>
            {info.commits.length === 0 && (
              <p className="project-git-info-empty">{t.noCommits}</p>
            )}
            <div className="project-git-info-commits">
              {info.commits.map((commit) => (
                <div key={commit.sha} className="project-git-info-commit-row">
                  <span className="project-git-info-commit-sha">{commit.short_sha}</span>
                  <span className="project-git-info-commit-subject">
                    {commit.subject}
                  </span>
                  <span className="project-git-info-commit-meta">
                    {commit.author} · {formatMessageTime(commit.timestamp, language)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {historyOpen && (
        <ProjectCommitHistoryModal
          projectPath={projectPath}
          language={language}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}
