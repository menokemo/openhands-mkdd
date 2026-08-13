import fs from "node:fs";

const DEFINITIONS_DIR = "/company-agents-definitions";

/**
 * Reads the frontmatter-style "- Label: value" fields out of an employee
 * definition file (e.g. "- Name: Bagosh"). Shared between the /api/employees
 * route (README section 3.2 employee cards) and conversation-title
 * generation (BUGS_AND_FIXES.md #24), so both read the exact same source
 * of truth instead of two independently-maintained regex copies.
 */
export function readEmployeeDisplayInfo(employeeId) {
  const file = `${DEFINITIONS_DIR}/${employeeId}.md`;
  const text = fs.readFileSync(file, "utf8");

  const read = (label) => {
    const m = text.match(new RegExp(`^- ${label}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : null;
  };

  return {
    displayNameEn: read("Name"),
    displayNameAr: read("Arabic Name"),
    role: read("Role"),
    order: Number((text.match(/^order:\s*(\d+)$/m) || [])[1] || 999),
  };
}
