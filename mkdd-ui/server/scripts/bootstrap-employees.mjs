import { openhandsFetch } from "../lib/openhands-client.mjs";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";

/**
 * Bootstrap script: creates an OpenHands Agent Profile for each employee
 * definition in /company-agents-definitions.
 *
 * Why this exists (see BUGS_AND_FIXES.md #16): Agent Profiles are not
 * auto-registered from the mounted company-agents-definitions/*.md files —
 * they are runtime entities stored in OpenHands' own state volume. A fresh
 * volume (e.g. a new VM, or the auto-deploy staging stack) starts with
 * zero profiles even though the definition files are present and correct.
 *
 * The live agent-server API REQUIRES `llm_profile_ref` at creation time
 * (confirmed via a real 422 response: "llm_profile_ref: Field required") —
 * profiles cannot be created "empty" and bound to an LLM later. Per an
 * explicit product decision, this script does NOT guess or hardcode an
 * LLM profile name: the caller must create one LLM profile first (via
 * Settings) and pass its name/id here. Every employee is created pointing
 * at that same starting LLM profile; each can be repointed individually
 * afterwards from the UI.
 *
 * Usage (run inside the mkdd-ui container, which shares the agent-canvas
 * container's PID namespace and so can discover its session key):
 *   docker exec -e MKDD_BOOTSTRAP_LLM_PROFILE_REF=<your-llm-profile-name> \
 *     mkdd-ui-staging node server/scripts/bootstrap-employees.mjs
 */

async function profileExists(name) {
  const r = await openhandsFetch(`/api/agent-profiles/${name}`);
  return r.status === 200;
}

async function createProfile(name, llmProfileRef) {
  const r = await openhandsFetch(`/api/agent-profiles/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_kind: "openhands",
      agent: "CodeActAgent",
      llm_profile_ref: llmProfileRef,
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

  const names = listEmployeeNames();
  console.log(`Found ${names.length} employee definitions: ${names.join(", ")}`);
  console.log(`Using LLM profile: ${llmProfileRef}\n`);

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
    const result = await createProfile(name, llmProfileRef);
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

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exitCode = 1;
});
