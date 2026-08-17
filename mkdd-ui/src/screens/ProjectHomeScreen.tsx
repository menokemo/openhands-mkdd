import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaFolder,
  FaFileLines,
  FaFileCode,
  FaFileImage,
  FaFile,
  FaUpload,
  FaSpinner,
  FaClipboardList,
  FaChartLine,
  FaPalette,
  FaCompassDrafting,
  FaCode,
  FaPlug,
  FaClipboardCheck,
  FaVial,
  FaCodeBranch,
  FaShieldHalved,
  FaServer,
  FaPen,
  FaRocket,
  FaLanguage,
  FaTriangleExclamation,
  FaMagnifyingGlass,
  FaCircleCheck,
  FaHourglassHalf,
  FaUserClock,
  FaWrench,
} from "react-icons/fa6";
import type { AgentProfile, Workspace } from "../types";
import type { ProjectEmployeeStatus } from "../hooks/useProjectTeamStatus";
import type { ProjectFile, WorkflowState, WorkflowReviewRole } from "../api/client";
import { fetchProjectFiles, uploadProjectFiles } from "../api/client";
import WorkflowStepper from "../components/WorkflowStepper";
import {
  REVIEW_ROLES,
  getGateLabel,
  getReviewLabel,
  getReviewStatusLabel,
  getFindingStatusLabel,
} from "../utils/workflowLabels";
import { formatRelativeTime } from "../utils/formatRelativeTime";

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

// Maps each employee's stable id (AgentProfile.id, e.g. "architect") to an
// icon representing their role - shown as a small badge on their avatar
// in the team strip, since the role text itself can be visually crowded
// at the strip's compact card width.
const ROLE_ICONS: Record<string, React.ComponentType> = {
  "product-manager": FaClipboardList,
  "business-analyst": FaChartLine,
  "ui-ux": FaPalette,
  architect: FaCompassDrafting,
  implementation: FaCode,
  "integration-engineer": FaPlug,
  qa: FaClipboardCheck,
  "test-automation": FaVial,
  "code-review": FaCodeBranch,
  "security-review": FaShieldHalved,
  devops: FaServer,
  "technical-writer": FaPen,
  "release-manager": FaRocket,
  "content-writer": FaLanguage,
};

const REVIEW_ICONS: Record<WorkflowReviewRole, React.ComponentType> = {
  qa: FaClipboardCheck,
  test_automation: FaVial,
  code_review: FaCodeBranch,
  security_review: FaShieldHalved,
};

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The project's slug on disk is the last path segment (e.g.
  // "/projects/test-site" -> "test-site") - matches how projects.mjs
  // names the directory it creates, and how preview.mjs/project-files.mjs
  // resolve it back.
  const projectSlug = project.path.split("/").filter(Boolean).pop() ?? "";

  function reloadProjectFiles() {
    setFilesLoading(true);
    return fetchProjectFiles(projectSlug)
      .then(setProjectFiles)
      .finally(() => setFilesLoading(false));
  }
  const memoizedReloadProjectFiles = useCallback(reloadProjectFiles, [projectSlug]);

  useEffect(() => {
    memoizedReloadProjectFiles();
  }, [memoizedReloadProjectFiles]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setUploadError(null);
    try {
      await uploadProjectFiles(projectSlug, Array.from(fileList));
      await reloadProjectFiles();
    } catch {
      setUploadError(
        language === "ar" ? "فشل الرفع، حاول تاني" : "Upload failed, try again",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const statusList = Array.from(teamStatusByEmployeeId.values());
  const workingCount = statusList.filter(
    (item) => item.executionStatus === "running",
  ).length;
  const waitingCount = statusList.filter(
    (item) => item.executionStatus === "waiting_for_confirmation",
  ).length;
  const idleCount = employees.length - workingCount - waitingCount;

  const openBlockers = workflow?.blockers.filter((item) => item.status === "open") ?? [];
  const openFindings =
    workflow?.findings.filter((item) => item.status !== "verified") ?? [];

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
                  {ROLE_ICONS[employee.id] &&
                    (() => {
                      const RoleIcon = ROLE_ICONS[employee.id];
                      return (
                        <span className="employee-role-badge" title={employee.role ?? ""}>
                          <RoleIcon />
                        </span>
                      );
                    })()}
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
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <div className="dashboard-card-heading">
            <FaUserClock />
            <h3>{language === "ar" ? "حالة الفريق الآن" : "Work Now"}</h3>
          </div>
          <ul className="dashboard-status-list">
            <li className="dashboard-status-active">
              <span className="dashboard-status-dot" aria-hidden="true" />
              {language === "ar" ? "يعملون الآن" : "Active workers"}
              <strong>{teamStatusLoading ? "…" : workingCount}</strong>
            </li>
            <li className="dashboard-status-waiting">
              <span className="dashboard-status-dot" aria-hidden="true" />
              {language === "ar" ? "بانتظار رد" : "Waiting for input"}
              <strong>{teamStatusLoading ? "…" : waitingCount}</strong>
            </li>
            <li className="dashboard-status-idle">
              <span className="dashboard-status-dot" aria-hidden="true" />
              {language === "ar" ? "خاملون" : "Idle"}
              <strong>{teamStatusLoading ? "…" : idleCount}</strong>
            </li>
          </ul>
        </article>

        <article className="dashboard-card">
          <div className="dashboard-card-heading">
            <FaClipboardCheck />
            <h3>{language === "ar" ? "المراجعات الإلزامية" : "Mandatory Reviews"}</h3>
          </div>
          <ul className="dashboard-review-list">
            {REVIEW_ROLES.map((reviewRole) => {
              const review = workflow?.reviews[reviewRole];
              const ReviewIcon = REVIEW_ICONS[reviewRole];
              const isComplete = review?.status === "complete";

              return (
                <li key={reviewRole} className={isComplete ? "review-complete" : ""}>
                  <ReviewIcon />
                  <span>{getReviewLabel(reviewRole, language)}</span>
                  <em>
                    {isComplete && <FaCircleCheck />}
                    {workflowLoading
                      ? "…"
                      : getReviewStatusLabel(review?.status, language)}
                  </em>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="dashboard-card">
          <div className="dashboard-card-heading">
            <FaTriangleExclamation />
            <h3>{language === "ar" ? "العوائق" : "Blockers"}</h3>
            <span className="dashboard-card-count">{openBlockers.length}</span>
          </div>
          {openBlockers.length === 0 ? (
            <p className="dashboard-empty">
              {language === "ar" ? "لا يوجد عوائق مفتوحة" : "No open blockers"}
            </p>
          ) : (
            <ul className="dashboard-item-list">
              {openBlockers.map((blocker) => (
                <li key={blocker.id}>
                  <strong>{blocker.title}</strong>
                  <span>
                    {blocker.createdBy} ·{" "}
                    {formatRelativeTime(blocker.createdAt, language)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="dashboard-card">
          <div className="dashboard-card-heading">
            <FaMagnifyingGlass />
            <h3>{language === "ar" ? "الملاحظات" : "Findings"}</h3>
            <span className="dashboard-card-count">{openFindings.length}</span>
          </div>
          {openFindings.length === 0 ? (
            <p className="dashboard-empty">
              {language === "ar" ? "لا توجد ملاحظات مفتوحة" : "No open findings"}
            </p>
          ) : (
            <ul className="dashboard-item-list">
              {openFindings.map((finding) => (
                <li key={finding.id}>
                  <strong>{finding.title}</strong>
                  <span>
                    {finding.reviewer} ·{" "}
                    {finding.status === "fixed_pending_verification" ? (
                      <FaWrench />
                    ) : (
                      <FaHourglassHalf />
                    )}{" "}
                    {getFindingStatusLabel(finding.status, language)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
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

          <button
            type="button"
            className="project-upload-button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <FaSpinner className="spin-icon" /> : <FaUpload />}
            {language === "ar" ? "ارفع ملفات" : "Upload files"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => handleFilesSelected(event.target.files)}
          />
        </div>

        {uploadError && <p className="project-upload-error">{uploadError}</p>}

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
