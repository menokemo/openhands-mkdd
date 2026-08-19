import fs from "node:fs";
import path from "node:path";
import { openhandsFetch } from "../lib/openhands-client.mjs";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";
import { buildTimeContextInstructions } from "../lib/time-context.mjs";
import { PREVIEW_INSTRUCTIONS } from "../lib/preview-instructions.mjs";
import { LIVE_APP_INSTRUCTIONS } from "../lib/live-app-instructions.mjs";
import { OWNER_UPLOADS_INSTRUCTIONS } from "../lib/owner-uploads-instructions.mjs";
import { GITHUB_REPO_INSTRUCTIONS } from "../lib/github-repo-instructions.mjs";

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
 *   docker exec \
 *     -e MKDD_BOOTSTRAP_LLM_PROFILE_REF=<your-llm-profile-name> \
 *     -e MKDD_TIMEZONE=<IANA timezone, e.g. Europe/Amsterdam> \
 *     mkdd-ui-staging node server/scripts/bootstrap-employees.mjs
 *
 * MKDD_TIMEZONE defaults to Europe/Amsterdam if not set. It tells each
 * employee what local timezone to convert the injected UTC timestamp to
 * when talking about "now" - the container's own clock is UTC internally
 * even when the host VM's timezone is set correctly (BUGS_AND_FIXES.md
 * #25 follow-up), so this must be explicit rather than inferred.
 */

const DEFINITIONS_DIR = "/company-agents-definitions";

/**
 * Splits a definition file into its frontmatter and body. The body (the
 * employee's actual instructions/persona) becomes system_message_suffix.
 * TIME_CONTEXT and PREVIEW instructions (see server/lib/time-context.mjs
 * and server/lib/preview-instructions.mjs) are appended once here so
 * every employee learns the same shared rules, instead of duplicating
 * that boilerplate across all 13 .md files.
 */
function readSystemMessageSuffix(name, timezone) {
  const file = path.join(DEFINITIONS_DIR, `${name}.md`);
  const content = fs.readFileSync(file, "utf8");
  const parts = content.split("---");
  // parts[0] is empty (content starts with "---"), parts[1] is frontmatter,
  // the rest (rejoined, in case the body itself contains "---") is the body.
  const body = parts.length >= 3 ? parts.slice(2).join("---") : content;
  return `${body.trim()}\n\n${buildTimeContextInstructions(timezone)}\n\n${PREVIEW_INSTRUCTIONS}\n\n${LIVE_APP_INSTRUCTIONS}\n\n${OWNER_UPLOADS_INSTRUCTIONS}\n\n${GITHUB_REPO_INSTRUCTIONS}`;
}

// BUGS_AND_FIXES.md #60: without an explicit condenser, an employee's
// conversation can hit litellm.APIError ("input exceeds the context
// window") with NO automatic recovery - confirmed live this had
// actually happened to Kirollos. Two real, separately-confirmed root
// causes: (1) no condenser was configured at all (confirmed live via
// the "Compact context" button itself failing with "No condenser
// configured"), and (2) the context-window figure the UI displays for
// this LLM profile (1.1M tokens) is a generic default, not this
// specific model's real limit - confirmed live via web research on the
// actual model behind this profile (GPT-5.6 Sol via a ChatGPT Plus/
// Codex subscription), whose real effective limit is ~258,400 tokens,
// not 1.1M. MAX_TOKENS below (160,000) is deliberately well under that
// real limit - condensation must trigger well before the real wall,
// not right at (or past) it.
//
// IMPORTANT: this number is specific to the CURRENT shared LLM profile
// (glm-5.2, actually GPT-5.6 Sol/ChatGPT Codex underneath). The owner's
// stated plan is to eventually give each employee their own dedicated
// LLM profile, likely on different underlying models with different
// real context windows - whoever does that must re-verify the correct
// max_tokens for EACH model at that time (the same research pattern
// used to find this number: check what the UI-displayed limit actually
// is for that real model, not just reuse 160,000 blindly).
const CONDENSER_MAX_TOKENS = 160000;

/**
 * Fetches the current llm_profile_ref for an existing Agent Profile, if
 * one exists. Returns null for a genuinely new employee (404) or on any
 * other failure - the caller falls back to the bootstrap default in
 * that case, since the create call requires SOME value.
 */
async function fetchCurrentLlmProfileRef(name) {
  const r = await openhandsFetch(`/api/agent-profiles/${name}`);
  if (!r.ok) return null;
  const data = await r.json();
  return data?.profile?.llm_profile_ref ?? null;
}

async function createOrUpdateProfile(name, defaultLlmProfileRef, timezone) {
  // BUGS_AND_FIXES.md #119: this upsert call previously always sent
  // defaultLlmProfileRef unconditionally, silently overwriting any LLM
  // change the owner had made manually from the UI the next time this
  // script ran - confirmed as the real cause of "I changed the model
  // in the UI but it didn't stick". An existing employee's CURRENT
  // llm_profile_ref is preserved; the default is only used the one
  // time a profile doesn't exist yet at all (the API rejects creation
  // without a value).
  const currentLlmProfileRef = await fetchCurrentLlmProfileRef(name);
  const llmProfileRef = currentLlmProfileRef ?? defaultLlmProfileRef;

  const r = await openhandsFetch(`/api/agent-profiles/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_kind: "openhands",
      agent: "CodeActAgent",
      llm_profile_ref: llmProfileRef,
      system_message_suffix: readSystemMessageSuffix(name, timezone),
      condenser: {
        enabled: true,
        max_size: 240,
        condenser_kind: "llm_summarizing",
        max_tokens: CONDENSER_MAX_TOKENS,
        keep_first: 2,
        minimum_progress: 0.1,
        hard_context_reset_max_retries: 5,
        hard_context_reset_context_scaling: 0.8,
      },
    }),
  });

  const bodyText = await r.text();
  return { ok: r.ok, status: r.status, body: bodyText, llmProfileRef };
}

async function main() {
  const llmProfileRef = process.env.MKDD_BOOTSTRAP_LLM_PROFILE_REF;
  const timezone = process.env.MKDD_TIMEZONE || "Europe/Amsterdam";

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
  console.log(`Using default LLM profile (for NEW employees only): ${llmProfileRef}`);
  console.log(`Existing employees keep whatever LLM they're currently set to.`);
  console.log(`Using timezone: ${timezone}\n`);

  let ok = 0;
  let failed = 0;

  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop -- intentionally sequential,
    // this runs once during bootstrap, not on a hot path.
    const result = await createOrUpdateProfile(name, llmProfileRef, timezone);
    if (result.ok) {
      console.log(`[ok]     ${name} (llm_profile_ref: ${result.llmProfileRef})`);
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
