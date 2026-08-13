import { openhands } from "../lib/openhands-client.mjs";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";
import { readEmployeeDisplayInfo } from "../lib/employee-display-info.mjs";

export async function handleProjects(req, res) {
  if (req.method !== "GET" || req.url !== "/api/projects") return false;

  const r = await openhands("/api/workspaces");
  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(await r.text());
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
      return {
        ...profile,
        ...info,
        avatarUrl: `/avatars/${profile.name}.webp`,
      };
    })
    .sort((a, b) => a.order - b.order);

  res.end(JSON.stringify(data));
  return true;
}
