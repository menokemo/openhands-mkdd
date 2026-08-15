import { useEffect, useState } from "react";
import { FaFolder, FaFileLines, FaFileCode, FaFileImage, FaFile } from "react-icons/fa6";
import type { AgentProfile, Workspace } from "../types";
import type { ProjectEmployeeStatus } from "../hooks/useProjectTeamStatus";
import type { ProjectFile, WorkflowState } from "../api/client";
import { fetchProjectFiles } from "../api/client";
import WorkflowStepper from "../components/WorkflowStepper";
import { REVIEW_ROLES, getGateLabel, getReviewLabel } from "../utils/workflowLabels";

type Props = {
  project: Workspace;
  employees: AgentProfile[];
  teamStatusByEmployeeId: Map<string, ProjectEmployeeStatus>;
  totalProjectCost: number;
  teamStatusLoading: boolean;
  workflow: WorkflowState | null;
  workflowLoading: boolean;
  language: "ar" | "en";
  onOpenEmployee: (employee: AgentProfile) => void;
};

const CODE_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "ts",
  "tsx",
  "jsx",
  "json",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "svg", "gif", "webp", "ico"]);
const TEXT_EXTENSIONS = new Set(["md", "txt"]);

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(ext)) return <FaFileImage />;
  if (CODE_EXTENSIONS.has(ext)) return <FaFileCode />;
  if (TEXT_EXTENSIONS.has(ext)) return <FaFileLines />;
  return <FaFile />;
}

/**
 * Body content for the Project Home screen. The header and back
 * navigation live in AppHeader/BreadcrumbBar (rendered once by App.tsx) -
 * this component only owns what's specific to a single project's page.
 */
export default function ProjectHomeScreen({
  project,
  employees,
  teamStatusByEmployeeId,
  totalProjectCost,
  teamStatusLoading,
  workflow,
  workflowLoading,
  language,
  onOpenEmployee,
}: Props) {
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);

  // The project's slug on disk is the last path segment (e.g.
  // "/projects/test-site" -> "test-site") - matches how projects.mjs
  // names the directory it creates, and how preview.mjs/project-files.mjs
  // resolve it back.
  const projectSlug = project.path.split("/").filter(Boolean).pop() ?? "";

  useEffect(() => {
    setFilesLoading(true);
    fetchProjectFiles(projectSlug)
      .then(setProjectFiles)
      .finally(() => setFilesLoading(false));
  }, [projectSlug]);

  const workingCount = Array.from(teamStatusByEmployeeId.values()).filter(
    (item) => item.executionStatus === "running",
  ).length;

  const openBlockers =
    workflow?.blockers.filter((item) => item.status === "open").length ?? 0;

  const unverifiedFindings =
    workflow?.findings.filter((item) => item.status !== "verified").length ?? 0;

  return (
    <main className="app project-home">
      <section className="project-home-section project-team-section">
        <div className="section-heading">
          <div>
            <small>MKDD</small>
            <h2>{language === "ar" ? "فريق المشروع" : "Project team"}</h2>
          </div>

          <span className="employee-count">{employees.length}</span>
        </div>

        <div className="employee-grid">
          {employees.map((employee) => {
            const status = teamStatusByEmployeeId.get(employee.id);
            const label =
              language === "ar" ? employee.displayNameAr : employee.displayNameEn;

            return (
              <div
                className={`employee-card${
                  status?.executionStatus === "running" ? " employee-card-running" : ""
                }`}
                key={employee.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenEmployee(employee)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenEmployee(employee);
                  }
                }}
              >
                <div className="employee-avatar">
                  {employee.avatarUrl ? (
                    <img src={employee.avatarUrl} alt={label ?? employee.name} />
                  ) : (
                    (label?.slice(0, 1) ?? "?")
                  )}
                </div>

                <div className="employee-card-info">
                  <strong>{label}</strong>
                  <span>{employee.role}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="project-summary-grid">
        <article className="project-summary-card">
          <small>{language === "ar" ? "التكلفة الإجمالية" : "Total project cost"}</small>
          <strong>{teamStatusLoading ? "…" : `$${totalProjectCost.toFixed(4)}`}</strong>
        </article>

        <article className="project-summary-card">
          <small>{language === "ar" ? "يعملون الآن" : "Working now"}</small>
          <strong>{teamStatusLoading ? "…" : workingCount}</strong>
        </article>

        <article className="project-summary-card">
          <small>{language === "ar" ? "المرحلة الحالية" : "Current gate"}</small>
          <strong>
            {workflowLoading
              ? "…"
              : workflow
                ? getGateLabel(workflow.currentGate, language)
                : "—"}
          </strong>
        </article>
      </section>

      <section className="project-home-section workflow-overview">
        <div className="section-heading">
          <div>
            <small>MKDD Workflow</small>
            <h2>{language === "ar" ? "سير المشروع" : "Project workflow"}</h2>
          </div>
        </div>

        <WorkflowStepper
          workflow={workflow}
          loading={workflowLoading}
          language={language}
        />

        <div className="section-heading workflow-subheading">
          <div>
            <small>Quality Gates</small>
            <h3>{language === "ar" ? "المراجعات الإلزامية" : "Mandatory reviews"}</h3>
          </div>
        </div>

        <div className="workflow-review-grid">
          {REVIEW_ROLES.map((reviewRole) => {
            const review = workflow?.reviews[reviewRole];

            return (
              <article
                className={`workflow-review-card workflow-review-${review?.status ?? "unknown"}`}
                key={reviewRole}
              >
                <small>{getReviewLabel(reviewRole, language)}</small>
                <strong>{workflowLoading ? "…" : (review?.status ?? "—")}</strong>
                {review?.reviewedBy && <span>{review.reviewedBy}</span>}
              </article>
            );
          })}
        </div>

        <div className="workflow-summary-row">
          <article>
            <span>{language === "ar" ? "عوائق مفتوحة" : "Open blockers"}</span>
            <strong>{workflowLoading ? "…" : openBlockers}</strong>
          </article>

          <article>
            <span>{language === "ar" ? "ملاحظات غير مؤكدة" : "Unverified findings"}</span>
            <strong>{workflowLoading ? "…" : unverifiedFindings}</strong>
          </article>
        </div>
      </section>

      <section className="project-home-section project-files-section">
        <div className="section-heading">
          <div>
            <small>MKDD</small>
            <h2>
              <FaFolder className="section-heading-icon" />
              {language === "ar" ? "ملفات المشروع" : "Project Files"}
            </h2>
          </div>
        </div>

        {filesLoading && (
          <p className="modal-hint">
            {language === "ar" ? "جاري التحميل..." : "Loading..."}
          </p>
        )}

        {!filesLoading && projectFiles.length === 0 && (
          <p className="modal-hint">
            {language === "ar" ? "لا توجد ملفات بعد" : "No files yet"}
          </p>
        )}

        <ul className="project-files-list">
          {projectFiles.map((file) => {
            const depth = file.path.split("/").length - 1;
            const name = file.path.split("/").pop() ?? "";

            return (
              <li
                key={file.path}
                className={`project-file-row project-file-${file.type}`}
                style={{ paddingInlineStart: `${depth * 20}px` }}
              >
                <span className="project-file-icon">
                  {file.type === "directory" ? <FaFolder /> : fileIcon(name)}
                </span>

                {file.type === "directory" ? (
                  <span className="project-file-name">{name}</span>
                ) : (
                  <a
                    className="project-file-name project-file-link"
                    href={`/preview/${projectSlug}/${file.path}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {name}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
