import fs from "node:fs";
import { openhands } from "../lib/openhands-client.mjs";

export async function handleProjects(req, res) {
  if (req.url !== "/api/projects") return false;

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
  const allowed = new Set(
    fs
      .readdirSync("/company-agents-definitions")
      .filter((name) => name.endsWith(".md") && name !== "company-orchestrator.md")
      .map((name) => name.replace(/\.md$/, "")),
  );

  data.profiles = (data.profiles ?? [])
    .filter((p) => allowed.has(p.name))
    .map((profile) => {
      const file = `/company-agents-definitions/${profile.name}.md`;
      const text = fs.readFileSync(file, "utf8");

      const read = (label) => {
        const m = text.match(new RegExp(`^- ${label}:\\s*(.+)$`, "m"));
        return m ? m[1].trim() : null;
      };

      return {
        ...profile,
        displayNameEn: read("Name"),
        displayNameAr: read("Arabic Name"),
        role: read("Role"),
        avatarUrl: `/avatars/${profile.name}.webp`,
        order: Number((text.match(/^order:\s*(\d+)$/m) || [])[1] || 999),
      };
    })
    .sort((a, b) => a.order - b.order);

  res.end(JSON.stringify(data));
  return true;
}
