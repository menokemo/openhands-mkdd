import fs from "node:fs";
import path from "node:path";
import { openhandsFetch } from "../lib/openhands-client.mjs";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";
import { TIME_CONTEXT_INSTRUCTIONS } from "../lib/time-context.mjs";

/**
 * Bootstrap script: creates (or updates) an OpenHands Agent Profile for
 * each employee definition in /company-agents-definitions.
 *
 * Why this exists (see BUGS_AND_FIXES.md #16): Agent Profiles are not
 * auto-registered from the mounted company-agents-definitions/*.md files —
 * they are runtime entities stored in OpenHands' own state volume. A fresh
 * volume (e.g. a new VM, or the auto-deploy staging stack) starts with
 * zero profiles even though the definition files are present and correct.
 *
 * The live agent-server API REQUIRES `llm_profile_ref` at creation time
 * (confirmed via a real 422 response: "llm_profile_ref: Field required") —
 * profiles cannot be created "empty" and bound to an LLM later. The caller
 * must create one LLM profile first (via Settings) and pass its name/id
 * here. Every employee is created pointing at that same starting LLM
 * profile; each can be repointed individually afterwards from the UI.
 *
 * The employee's actual identity/instructions (everything after the
 * frontmatter in the .md file) is sent as `system_message_suffix` — the
 * same field the MKDD customization in agent-profiles-local-view.tsx
 * exposes in the UI (README section 9). Without it, a profile exists but
 * has no personality/rules bound to it (observed live: "Employee
 * Instructions" showed empty in the UI after the first bootstrap run,
 * which only set agent_kind/agent/llm_profile_ref).
 *
 * POST /api/agent-profiles/{name} is an upsert (create-or-update, mirroring
 * the frontend's own saveProfile call used for both create and edit), so
 * this script re-runs safely: existing profiles get their instructions
 * (re)applied rather than being skipped.
 *
 * Usage (run inside the mkdd-ui container, which shares the agent-canvas
 * container's PID namespace and so can discover its session key):
 *   docker exec -e MKDD_BOOTSTRAP_LLM_PROFILE_REF=<your-llm-profile-name> \
 *     mkdd-ui-staging node server/scripts/bootstrap-employees.mjs
 */

const DEFINITIONS_DIR = "/company-agents-definitions";

/**
 * Splits a definition file into its frontmatter and body. The body (the
 * employee's actual instructions/persona) becomes system_message_suffix.
 * TIME_CONTEXT_INSTRUCTIONS (see server/lib/time-context.mjs) is appended
 * once here so every employee learns the same live-time marker format,
 * instead of duplicating that boilerplate across all 13 .md files.
 */
function readSystemMessageSuffix(name) {
  const file = path.join(DEFINITIONS_DIR, `${name}.md`);
  const content = fs.readFileSync(file, "utf8");
  const parts = content.split("---");
  // parts[0] is empty (content starts with "---"), parts[1] is frontmatter,
  // the rest (rejoined, in case the body itself contains "---") is the body.
  const body = parts.length >= 3 ? parts.slice(2).join("---") : content;
  return `${body.trim()}\n\n${TIME_CONTEXT_INSTRUCTIONS}`;
}

async function createOrUpdateProfile(name, llmProfileRef) {
  const r = await openhandsFetch(`/api/agent-profiles/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_kind: "openhands",
      agent: "CodeActAgent",
      llm_profile_ref: llmProfileRef,
      system_message_suffix: readSystemMessageSuffix(name),
    }),
  });

  const bodyText = await r.text();
  return { ok: r.ok, status: r.status, body: bodyText };
}

async function main() {
  const llmProfileRef = process.env.MKDD_BOOTSTRAP_LLM_PROFILE_REF;

  if (!llmProfileRef) {
    console.error(
      "ERROR: MKDD_BOOTSTRAP_LLM_PROFILE_REF is not set.\n\n" +
        "The agent-server requires an llm_profile_ref to create an Agent\n" +
        "Profile - it cannot be created empty and bound later. Create an\n" +
        "LLM profile first (Settings -> LLM Profiles), note its name, then\n" +
        "run:\n\n" +
        "  docker exec -e MKDD_BOOTSTRAP_LLM_PROFILE_REF=<your-llm-profile-name> \\\n" +
        "    mkdd-ui-staging node server/scripts/bootstrap-employees.mjs\n",
    );
    process.exitCode = 1;
    return;
  }

  const names = listEmployeeNames(DEFINITIONS_DIR);
  console.log(`Found ${names.length} employee definitions: ${names.join(", ")}`);
  console.log(`Using LLM profile: ${llmProfileRef}\n`);

  let ok = 0;
  let failed = 0;

  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential,
    // this runs once during bootstrap, not on a hot path.
    const result = await createOrUpdateProfile(name, llmProfileRef);
    if (result.ok) {
      console.log(`[ok]     ${name}`);
      ok += 1;
    } else {
      console.error(`[FAILED] ${name} — HTTP ${result.status}: ${result.body}`);
      failed += 1;
    }
  }

  console.log("");
  console.log(`Done. ok=${ok} failed=${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exitCode = 1;
});
