import { useEffect, useState } from "react";
import type { AgentProfile, Workspace } from "../types";

type Params = {
  projects: Workspace[];
  employees: AgentProfile[];
};

export function useProjectNavigation({ projects, employees }: Params) {
  const [selectedProject, setSelectedProject] = useState<Workspace | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<AgentProfile | null>(null);

  useEffect(() => {
    function syncFromUrl() {
      const hashPath = decodeURIComponent(window.location.hash.slice(1));

      const project = projects.find((workspace) => workspace.path === hashPath) ?? null;

      setSelectedProject(project);

      if (!project) {
        setSelectedEmployee(null);
        return;
      }

      const employeeName = new URLSearchParams(window.location.search).get("employee");

      const employee = employees.find((profile) => profile.name === employeeName) ?? null;

      setSelectedEmployee(employee);
    }

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);

    return () => {
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [projects, employees]);

  function openProject(project: Workspace) {
    const url = new URL(window.location.href);
    url.hash = project.path;
    url.searchParams.delete("employee");

    history.pushState(null, "", url);

    setSelectedProject(project);
    setSelectedEmployee(null);
  }

  function closeProject() {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("employee");

    history.pushState(null, "", url.pathname + url.search);

    setSelectedProject(null);
    setSelectedEmployee(null);
  }

  function openEmployee(employee: AgentProfile) {
    const url = new URL(window.location.href);
    url.searchParams.set("employee", employee.name);

    history.pushState(null, "", url);

    setSelectedEmployee(employee);
  }

  function closeEmployee() {
    const url = new URL(window.location.href);
    url.searchParams.delete("employee");

    history.pushState(null, "", url);

    setSelectedEmployee(null);
  }

  return {
    selectedProject,
    selectedEmployee,
    openProject,
    closeProject,
    openEmployee,
    closeEmployee,
  };
}
