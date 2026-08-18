import { useEffect, useState } from "react";
import type { AgentProfile, Workspace } from "./types";
import {
  fetchProjects,
  fetchEmployees,
  fetchWorkflowSummaries,
  createProject,
  uploadEmployeeAvatar,
  type WorkflowSummary,
} from "./api/client";
import ChatScreen from "./screens/ChatScreen";
import ProjectsScreen from "./screens/ProjectsScreen";
import ProjectHomeScreen from "./screens/ProjectHomeScreen";
import AppHeader from "./components/AppHeader";
import BreadcrumbBar from "./components/BreadcrumbBar";
import Sidebar, { type SidebarMenuKey } from "./components/Sidebar";
import ProjectListModal from "./components/ProjectListModal";
import EmployeeListModal from "./components/EmployeeListModal";
import EmployeeProfileModal from "./components/EmployeeProfileModal";
import "./App.css";
import { useLanguage } from "./i18n/useLanguage";
import { useTheme } from "./hooks/useTheme";
import { useProjectNavigation } from "./hooks/useProjectNavigation";
import { useConversation } from "./hooks/useConversation";
import { useProjectTeamStatus } from "./hooks/useProjectTeamStatus";
import { useProjectTotalCost } from "./hooks/useProjectTotalCost";
import { useProjectWorkflow } from "./hooks/useProjectWorkflow";
import { groupProjectsByGateStatus } from "./utils/projectGateStatus";

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
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
    setMessage,
    sendMessage,
    startFreshConversation,
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
        setMessage={setMessage}
        sendMessage={sendMessage}
        startFreshConversation={startFreshConversation}
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
      />
    );
  }

  const isChatScreen = Boolean(selectedProject && selectedEmployee);

  return (
    <>
      {!isChatScreen && (
        <AppHeader
          language={language}
          languageLabel={t.language}
          setLanguage={setLanguage}
          theme={theme}
          setTheme={setTheme}
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
        onClose={() => setSidebarOpen(false)}
        onSelect={setActiveSidebarMenu}
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
  );
}
