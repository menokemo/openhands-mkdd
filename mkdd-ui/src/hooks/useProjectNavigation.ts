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
    // Depends on LENGTH, not the arrays themselves (BUGS_AND_FIXES.md
    // #144) - employees now refreshes silently every 30s (#141), giving
    // a brand-new array reference each time even when the actual data
    // is identical. Depending on the array directly re-ran this effect
    // on every refresh, reassigning selectedEmployee with a fresh
    // object reference each time - which in turn made useConversation's
    // effect (which depends on the employee object) reset and reload
    // the entire open conversation every 30 seconds. Length only
    // changes when an employee/project is genuinely added or removed,
    // which is the only time this effect actually needs to re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length, employees.length]);

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
