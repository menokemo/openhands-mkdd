import { openhands } from "../lib/openhands-client.mjs";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";
import { readEmployeeDisplayInfo } from "../lib/employee-display-info.mjs";
import { findEmployeeAvatarFile } from "./avatars.mjs";
import { getProjectColor } from "../lib/project-metadata.mjs";

export async function handleProjects(req, res) {
  if (req.method !== "GET" || req.url !== "/api/projects") return false;

  const r = await openhands("/api/workspaces");
  const data = await r.json();

  data.workspaces = (data.workspaces ?? []).map((workspace) => ({
    ...workspace,
    color: getProjectColor(workspace.path),
  }));

  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
  return true;
}

export async function handleEmployees(req, res) {
  if (req.url !== "/api/employees") return false;

  const r = await openhands("/api/agent-profiles");
  res.writeHead(r.status, { "content-type": "application/json" });

  const data = await r.json();
  const allowed = new Set(listEmployeeNames());

  data.profiles = (data.profiles ?? [])
    .filter((p) => allowed.has(p.name))
    .map((profile) => {
      const info = readEmployeeDisplayInfo(profile.name);
      const avatar = findEmployeeAvatarFile(profile.name);
      return {
        ...profile,
        ...info,
        avatarUrl: avatar ? `/avatars/${profile.name}` : null,
      };
    })
    .sort((a, b) => a.order - b.order);

  res.end(JSON.stringify(data));
  return true;
}
