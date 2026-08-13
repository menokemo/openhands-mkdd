import fs from "node:fs";
import { openhandsFetch } from "../lib/openhands-client.mjs";

/**
 * Bootstrap script: creates an OpenHands Agent Profile for each employee
 * definition in /company-agents-definitions, WITHOUT an LLM binding.
 *
 * Why this exists (see BUGS_AND_FIXES.md #16): Agent Profiles are not
 * auto-registered from the mounted company-agents-definitions/*.md files —
 * they are runtime entities stored in OpenHands' own state volume. A fresh
 * volume (e.g. a new VM, or the auto-deploy staging stack) starts with
 * zero profiles even though the definition files are present and correct.
 *
 * This script intentionally does NOT set `llm_profile_ref` — per an
 * explicit product decision, employees are created bare and the LLM
 * binding is configured afterwards, per employee, from the Settings UI.
 *
 * Usage (run inside the mkdd-ui container, which shares the agent-canvas
 * container's PID namespace and so can discover its session key):
 *   docker exec mkdd-ui-staging node server/scripts/bootstrap-employees.mjs
 */

const DEFINITIONS_DIR = "/company-agents-definitions";

function listEmployeeNames() {
  return fs
    .readdirSync(DEFINITIONS_DIR)
    .filter((name) => name.endsWith(".md") && name !== "company-orchestrator.md")
    .map((name) => name.replace(/\.md$/, ""));
}

async function profileExists(name) {
  const r = await openhandsFetch(`/api/agent-profiles/${name}`);
  return r.status === 200;
}

async function createProfile(name) {
  const r = await openhandsFetch(`/api/agent-profiles/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_kind: "openhands",
      agent: "CodeActAgent",
    }),
  });

  const bodyText = await r.text();
  return { ok: r.ok, status: r.status, body: bodyText };
}

async function main() {
  const names = listEmployeeNames();
  console.log(`Found ${names.length} employee definitions: ${names.join(", ")}`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential,
    // this runs once during bootstrap, not on a hot path.
    if (await profileExists(name)) {
      console.log(`[skip]   ${name} — profile already exists`);
      skipped += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await createProfile(name);
    if (result.ok) {
      console.log(`[created] ${name}`);
      created += 1;
    } else {
      console.error(`[FAILED] ${name} — HTTP ${result.status}: ${result.body}`);
      failed += 1;
    }
  }

  console.log("");
  console.log(`Done. created=${created} skipped=${skipped} failed=${failed}`);
  console.log("Remember: no LLM profile is bound yet — configure each employee's");
  console.log("LLM in Settings before using them.");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exitCode = 1;
});
