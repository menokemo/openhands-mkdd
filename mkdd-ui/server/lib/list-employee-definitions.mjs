import fs from "node:fs";

/**
 * Filenames in company-agents-definitions/ that are company-wide policy
 * documents, not individual employee definitions, and must never be
 * treated as an employee/agent-profile name.
 *
 * BUGS_AND_FIXES.md #19: AGENTS.md was added to this directory (it belongs
 * there so it's mounted alongside the employee files) but nothing excluded
 * it from the employee-listing logic, so it was briefly treated as a 14th
 * "employee" named "AGENTS" by both the /api/employees route and the
 * bootstrap script.
 */
const NON_EMPLOYEE_FILES = new Set(["company-orchestrator.md", "AGENTS.md"]);

/**
 * Lists employee identifiers (the `name` used for their Agent Profile)
 * from the definitions directory, excluding company policy documents.
 * This is the single source of truth for "which .md files are employees" —
 * used by both the /api/employees route and the bootstrap script, so a
 * future addition to this directory only needs to be excluded here once.
 */
export function listEmployeeNames(definitionsDir = "/company-agents-definitions") {
  return fs
    .readdirSync(definitionsDir)
    .filter((name) => name.endsWith(".md") && !NON_EMPLOYEE_FILES.has(name))
    .map((name) => name.replace(/\.md$/, ""));
}
