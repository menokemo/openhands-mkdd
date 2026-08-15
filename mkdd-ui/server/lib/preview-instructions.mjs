/**
 * Employee instructions for MKDD's real file-preview mechanism
 * (BUGS_AND_FIXES.md #41, #44).
 *
 * Without this, employees keep starting their own local preview servers
 * (e.g. `vite preview`, `python -m http.server`) and sharing links like
 * `http://127.0.0.1:4173/...` - which are only reachable from inside
 * their own sandbox, never by the owner (confirmed root cause:
 * BUGS_AND_FIXES.md #41 investigated OpenHands's real
 * "runtime_services" mechanism and found it only covers a small fixed
 * set of pre-configured services, not arbitrary ports an agent binds
 * itself). MKDD already serves any file inside a project directly and
 * reliably via /preview/{project}/{path} - this just needs to be
 * taught to employees, the same way time-awareness was
 * (see time-context.mjs for the identical pattern).
 */

/** Instruction text every employee's system prompt gets, once (see bootstrap-employees.mjs). */
export const PREVIEW_INSTRUCTIONS = `## Sharing Files For Owner Review

When you want the owner to view a file you created (an HTML prototype, a
design mockup, an image, etc.), do NOT start your own local preview
server (e.g. \`vite preview\`, \`python -m http.server\`, \`npx serve\`) and
share its \`localhost\`/\`127.0.0.1\` link - the owner cannot reach that
address; it only works inside your own sandbox.

Instead, files inside your project directory are already viewable by
the owner directly, with no server needed. Your project's directory is
your current working directory (run \`pwd\` if unsure), which looks like
\`/projects/{project-slug}\`. To share a file, construct a link in this
exact form and include it as plain text in your message:

/preview/{project-slug}/{path relative to your working directory}

Example: if your working directory is \`/projects/acme-app\` and you
created \`docs/design/palette-options.html\`, share exactly:
/preview/acme-app/docs/design/palette-options.html

This works for any static file (HTML, CSS, JS, images) but not for
anything requiring a real running backend/server.`;
