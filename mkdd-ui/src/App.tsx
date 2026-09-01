import { useEffect, useState } from "react";
import type { AgentProfile, Workspace } from "./types";
import {
  fetchProjects,
  fetchEmployees,
  fetchWorkflowSummaries,
  createProject,
  importProject,
  uploadEmployeeAvatar,
  type WorkflowSummary,
} from "./api/client";
import ChatScreen from "./screens/ChatScreen";
import ProjectsScreen from "./screens/ProjectsScreen";
import ProjectHomeScreen from "./screens/ProjectHomeScreen";
import AppHeader from "./components/AppHeader";
import BreadcrumbBar from "./components/BreadcrumbBar";
import Sidebar, { type SidebarMenuKey } from "./components/Sidebar";
import type { CurrentUser } from "./components/AuthGate";
import ProjectListModal from "./components/ProjectListModal";
import EmployeeListModal from "./components/EmployeeListModal";
import EmployeeProfileModal from "./components/EmployeeProfileModal";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";
import { useLanguage } from "./i18n/useLanguage";
import { useTheme } from "./hooks/useTheme";
import { useProjectNavigation } from "./hooks/useProjectNavigation";
import { useConversation } from "./hooks/useConversation";
import { useProjectTeamStatus } from "./hooks/useProjectTeamStatus";
import { useProjectTotalCost } from "./hooks/useProjectTotalCost";
import { useProjectWorkflow } from "./hooks/useProjectWorkflow";
import { groupProjectsByGateStatus } from "./utils/projectGateStatus";

type Props = {
  currentUser: CurrentUser;
  onAvatarChange: (avatarUrl: string | null) => void;
};

export default function App({ currentUser, onAvatarChange }: Props) {
  const { language, setLanguage, t } = useLanguage();
  const {
    style: themeStyle,
    setStyle: setThemeStyle,
    mode: themeMode,
    setMode: setThemeMode,
  } = useTheme();
  const [projects, setProjects] = useState<Workspace[]>([]);
  const [employees, setEmployees] = useState<AgentProfile[]>([]);
  const [workflowSummaries, setWorkflowSummaries] = useState<
    Record<string, WorkflowSummary>
  >({});
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSidebarMenu, setActiveSidebarMenu] = useState<SidebarMenuKey | null>(null);
  const [profileEmployee, setProfileEmployee] = useState<AgentProfile | null>(null);

  const {
    selectedProject,
    selectedEmployee,
    openProject,
    closeProject,
    openEmployee,
    closeEmployee,
  } = useProjectNavigation({ projects, employees });

  const {
    messages,
    activity,
    workPlan,
    cost,
    executionStatus,
    message,
    sending,
    sendError,
    setMessage,
    sendMessage,
    startFreshConversation,
    hasOlderMessages,
    loadingOlder,
    loadOlderMessages,
    isOpeningConversation,
    openError,
  } = useConversation({
    project: selectedProject,
    employee: selectedEmployee,
  });

  const { byEmployeeId: teamStatusByEmployeeId, loading: teamStatusLoading } =
    useProjectTeamStatus({
      project: selectedProject,
      employees,
    });

  const { totalCost: totalProjectCost } = useProjectTotalCost(selectedProject);

  const {
    workflow,
    loading: workflowLoading,
    setWorkflow,
  } = useProjectWorkflow({
    project: selectedProject,
  });

  // Projects and employees are both global (agent profiles aren't
  // project-scoped), so both load once at startup - the sidebar needs the
  // full employee list regardless of whether a project is currently open.
  useEffect(() => {
    Promise.all([fetchProjects(), fetchEmployees()])
      .then(([projectsResult, employeesResult]) => {
        setProjects(projectsResult);
        setEmployees(employeesResult);
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Employees are refreshed periodically in the background
   * (BUGS_AND_FIXES.md #141) - the one-time load above meant a model
   * changed on an employee's Agent Profile (from OpenHands directly,
   * outside MKDD) after the app was already open never showed up until
   * a full page reload. Last-known-good: on failure, silently keeps the
   * existing list rather than blanking anything; on success, replaces
   * it without any loading indicator, since this is a quiet background
   * sync, not an initial load.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEmployees()
        .then(setEmployees)
        .catch(() => {
          // Keep the last known-good employee list visible.
        });
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  // Refreshed on every sidebar open so the active/near-completion/completed
  // grouping reflects the latest gate approvals without needing a full
  // page reload.
  const refreshWorkflowSummaries = () => {
    fetchWorkflowSummaries().then(setWorkflowSummaries);
  };

  useEffect(() => {
    refreshWorkflowSummaries();
  }, []);

  const handleCreateProject = async (name: string, color: string) => {
    const project = await createProject(name, color);
    setProjects((prev) => [...prev, project]);
  };

  const handleImportProject = async (name: string, url: string, color: string) => {
    const project = await importProject(name, url, color);
    setProjects((prev) => [...prev, project]);
  };

  const handleUploadAvatar = async (employeeSlug: string, imageDataUrl: string) => {
    const avatarUrl = await uploadEmployeeAvatar(employeeSlug, imageDataUrl);
    setEmployees((prev) =>
      prev.map((e) => (e.name === employeeSlug ? { ...e, avatarUrl } : e)),
    );
    setProfileEmployee((prev) =>
      prev && prev.name === employeeSlug ? { ...prev, avatarUrl } : prev,
    );
  };

  const currentEmployeeLabel = selectedEmployee
    ? language === "ar"
      ? selectedEmployee.displayNameAr
      : selectedEmployee.displayNameEn
    : null;

  let screen: React.ReactNode;

  if (selectedProject && selectedEmployee) {
    screen = (
      <ChatScreen
        language={language}
        employee={selectedEmployee}
        project={selectedProject}
        onBack={closeEmployee}
        messages={messages}
        activity={activity}
        workPlan={workPlan}
        cost={cost}
        executionStatus={executionStatus}
        message={message}
        sending={sending}
        sendError={sendError}
        setMessage={setMessage}
        sendMessage={sendMessage}
        startFreshConversation={startFreshConversation}
        hasOlderMessages={hasOlderMessages}
        loadingOlder={loadingOlder}
        loadOlderMessages={loadOlderMessages}
        isOpeningConversation={isOpeningConversation}
        openError={openError}
      />
    );
  } else if (selectedProject) {
    screen = (
      <ProjectHomeScreen
        project={selectedProject}
        employees={employees}
        teamStatusByEmployeeId={teamStatusByEmployeeId}
        totalProjectCost={totalProjectCost}
        teamStatusLoading={teamStatusLoading}
        workflow={workflow}
        workflowLoading={workflowLoading}
        onWorkflowChange={setWorkflow}
        language={language}
        onOpenEmployee={openEmployee}
      />
    );
  } else {
    screen = (
      <ProjectsScreen
        projects={projects}
        employees={employees}
        loading={loading}
        language={language}
        t={t}
        onOpenProject={openProject}
        onCreateProject={handleCreateProject}
        onImportProject={handleImportProject}
      />
    );
  }

  const isChatScreen = Boolean(selectedProject && selectedEmployee);

  return (
    <ErrorBoundary language={language}>
      <>
        {!isChatScreen && (
          <AppHeader
            language={language}
            onOpenSidebar={() => {
              refreshWorkflowSummaries();
              setSidebarOpen(true);
            }}
          />
        )}

        {selectedProject && !isChatScreen && (
          <BreadcrumbBar
            projectName={selectedProject.name}
            employeeName={currentEmployeeLabel}
            backLabel={t.back}
            onBack={selectedEmployee ? closeEmployee : closeProject}
          />
        )}

        {screen}

        <Sidebar
          open={sidebarOpen}
          language={language}
          languageLabel={t.language}
          setLanguage={setLanguage}
          themeStyle={themeStyle}
          setThemeStyle={setThemeStyle}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          onClose={() => setSidebarOpen(false)}
          onSelect={setActiveSidebarMenu}
          currentUser={currentUser}
          onAvatarChange={onAvatarChange}
        />

        {(activeSidebarMenu === "active" ||
          activeSidebarMenu === "nearCompletion" ||
          activeSidebarMenu === "completed") && (
          <ProjectListModal
            title={
              {
                active: language === "ar" ? "المشاريع الحالية" : "Active Projects",
                nearCompletion: language === "ar" ? "قربت تخلص" : "Near Completion",
                completed: language === "ar" ? "خلصت" : "Completed",
              }[activeSidebarMenu]
            }
            projects={
              groupProjectsByGateStatus(projects, workflowSummaries)[activeSidebarMenu]
            }
            language={language}
            onOpenProject={openProject}
            onClose={() => setActiveSidebarMenu(null)}
          />
        )}

        {activeSidebarMenu === "employees" && (
          <EmployeeListModal
            employees={employees}
            language={language}
            onOpenEmployeeProfile={setProfileEmployee}
            onClose={() => setActiveSidebarMenu(null)}
          />
        )}

        {profileEmployee && (
          <EmployeeProfileModal
            employee={profileEmployee}
            language={language}
            onClose={() => setProfileEmployee(null)}
            onUploadAvatar={handleUploadAvatar}
          />
        )}
      </>
    </ErrorBoundary>
  );
}
