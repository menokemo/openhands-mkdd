import { useEffect, useState } from "react";
import type { Workspace, AgentProfile } from "./types";
import {
  fetchProjects,
  fetchEmployees,
  createProject,
  uploadEmployeeAvatar,
} from "./api/client";
import ChatScreen from "./screens/ChatScreen";
import ProjectsScreen from "./screens/ProjectsScreen";
import ProjectHomeScreen from "./screens/ProjectHomeScreen";
import "./App.css";
import { useLanguage } from "./i18n/useLanguage";
import { useProjectNavigation } from "./hooks/useProjectNavigation";
import { useConversation } from "./hooks/useConversation";
import { useProjectTeamStatus } from "./hooks/useProjectTeamStatus";

import { useProjectWorkflow } from "./hooks/useProjectWorkflow";
export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [projects, setProjects] = useState<Workspace[]>([]);
  const [employees, setEmployees] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

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
  } = useConversation({
    project: selectedProject,
    employee: selectedEmployee,
  });

  const {
    byEmployeeId: teamStatusByEmployeeId,
    totalProjectCost,
    loading: teamStatusLoading,
  } = useProjectTeamStatus({
    project: selectedProject,
    employees,
  });

  const { workflow, loading: workflowLoading } = useProjectWorkflow({
    project: selectedProject,
  });
  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
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
  };

  useEffect(() => {
    if (!selectedProject) {
      setEmployees([]);
      return;
    }

    fetchEmployees().then(setEmployees);
  }, [selectedProject]);

  if (selectedProject && selectedEmployee) {
    return (
      <ChatScreen
        language={language}
        employee={selectedEmployee}
        messages={messages}
        activity={activity}
        workPlan={workPlan}
        cost={cost}
        executionStatus={executionStatus}
        message={message}
        sending={sending}
        setMessage={setMessage}
        sendMessage={sendMessage}
        onBack={closeEmployee}
      />
    );
  }

  if (selectedProject) {
    return (
      <ProjectHomeScreen
        project={selectedProject}
        employees={employees}
        teamStatusByEmployeeId={teamStatusByEmployeeId}
        totalProjectCost={totalProjectCost}
        teamStatusLoading={teamStatusLoading}
        workflow={workflow}
        workflowLoading={workflowLoading}
        language={language}
        t={t}
        setLanguage={setLanguage}
        onBack={closeProject}
        onOpenEmployee={openEmployee}
        onUploadAvatar={handleUploadAvatar}
      />
    );
  }

  return (
    <ProjectsScreen
      projects={projects}
      loading={loading}
      language={language}
      t={t}
      setLanguage={setLanguage}
      onOpenProject={openProject}
      onCreateProject={handleCreateProject}
    />
  );
}
