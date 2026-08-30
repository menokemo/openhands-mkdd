import { useEffect, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { fetchProjectGitInfo, type ProjectCommit } from "../api/client";
import { formatMessageTime } from "../utils/formatMessageTime";

type Props = {
  projectPath: string;
  language: "ar" | "en";
  onClose: () => void;
};

/**
 * Full commit history for a project (BUGS_AND_FIXES.md #167), opened
 * from the "شوف الكل" button on ProjectGitInfoCard. Requests up to
 * OpenHands' own real maximum (200) - there's no true pagination
 * beyond that in OpenHands' own /api/git/commits, just a higher
 * single-request limit, so this is the real ceiling, not an
 * arbitrary MKDD-side choice.
 */
export default function ProjectCommitHistoryModal({
  projectPath,
  language,
  onClose,
}: Props) {
  const [commits, setCommits] = useState<ProjectCommit[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProjectGitInfo(projectPath, 200)
      .then((data) => {
        if (!cancelled) {
          setCommits(data.commits);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const t =
    language === "ar"
      ? {
          title: "كل الـCommits",
          empty: "لسه مفيش أي Commit.",
          note: "بيعرض آخر 200 Commit كحد أقصى — دي أعلى قيمة متاحة فعليًا من OpenHands نفسها.",
        }
      : {
          title: "All Commits",
          empty: "No commits yet.",
          note: "Shows up to the last 200 commits — the real maximum OpenHands itself supports.",
        };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal list-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gate-reports-modal-header">
          <h2>{t.title}</h2>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label={language === "ar" ? "إغلاق" : "Close"}
          >
            <FaXmark />
          </button>
        </div>

        {!loading && commits?.length === 0 && (
          <p className="project-git-info-empty">{t.empty}</p>
        )}

        {!loading && commits && commits.length > 0 && (
          <>
            <p className="project-git-info-modal-note">{t.note}</p>
            <div className="list-modal-items">
              {commits.map((commit) => (
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
      </div>
    </div>
  );
}
