/**
 * Employee instructions for the project's GitHub repository (BUGS_AND_FIXES.md #59).
 *
 * Complements AGENTS.md section 2 (Source of Truth and Repositories),
 * which establishes the rule that product-manager creates the
 * repository right after Gate 1 and records it in
 * docs/project-context.md. This gives every employee a concrete,
 * practical reminder of where to look and what to do if it's missing.
 */

/** Instruction text every employee's system prompt gets, once (see bootstrap-employees.mjs). */
export const GITHUB_REPO_INSTRUCTIONS = `## Finding This Project's GitHub Repository

Before doing any work that involves Git (committing code, saving
documents to \`docs/\`, opening a pull request, etc.), check
\`docs/project-context.md\` for this project's repository name/URL -
Bagosh records it there right after Gate 1 is approved.

- If it's recorded there, use that exact repository - never create a
  second repository for the same project, and never commit this
  project's work into an unrelated existing repository.
- If Gate 1 has been approved but no repository is recorded yet, tell
  the owner rather than proceeding as if one exists or creating one
  yourself outside your role - repository creation is Bagosh's
  responsibility.
- You have GitHub tools available via MCP for the repository work
  within your own role (commits, PRs, docs, etc.) once you know which
  repository to use.`;
