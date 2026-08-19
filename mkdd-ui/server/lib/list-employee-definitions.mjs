import fs from "node:fs";
import path from "node:path";

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
 * Reads the "order: N" frontmatter field from an employee's .md file.
 * Every employee file already carries this field (confirmed directly -
 * BUGS_AND_FIXES.md #116), but nothing previously read it, so the team
 * strip's visible order was just whatever fs.readdirSync() happened to
 * return - correct by coincidence for the original 13 employees, but
 * broke the moment a 14th (Sherry/content-writer) was added later with
 * a filesystem-arbitrary position instead of her intended one (right
 * after Mariam/ui-ux). Falls back to a large number (sorts last) for
 * any file that's somehow missing the field, rather than crashing.
 */
function readOrder(definitionsDir, fileName) {
  try {
    const content = fs.readFileSync(path.join(definitionsDir, fileName), "utf-8");
    const match = content.match(/^order:\s*(\d+)/m);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Lists employee identifiers (the `name` used for their Agent Profile)
 * from the definitions directory, excluding company policy documents,
 * sorted by each file's own "order" frontmatter field - the single
 * source of truth for "which .md files are employees, in what order" —
 * used by both the /api/employees route and the bootstrap script, so a
 * future addition to this directory only needs to be excluded/ordered
 * here once.
 */
export function listEmployeeNames(definitionsDir = "/company-agents-definitions") {
  return fs
    .readdirSync(definitionsDir)
    .filter((name) => name.endsWith(".md") && !NON_EMPLOYEE_FILES.has(name))
    .sort((a, b) => readOrder(definitionsDir, a) - readOrder(definitionsDir, b))
    .map((name) => name.replace(/\.md$/, ""));
}
