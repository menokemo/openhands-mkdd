/**
 * Employee instructions for MKDD's real live-app preview mechanism
 * (BUGS_AND_FIXES.md #56).
 *
 * Complements PREVIEW_INSTRUCTIONS (preview-instructions.mjs), which
 * covers STATIC files only (HTML/CSS/JS/images with no server needed).
 * This covers the opposite case: a real, running application (a real
 * backend, a real dev server) that the owner needs to actually use
 * live, not just view as static files.
 *
 * This is the SECOND, complete redesign of this mechanism (replacing
 * the earlier shared-single-port + subpath-rewrite approach). That
 * approach required rewriting every absolute path a target app might
 * reference - an open-ended, ever-growing list discovered incrementally
 * (asset paths, then API paths, then whatever would have come next).
 * Each project now gets its OWN dedicated port from a reserved range,
 * reached directly (not through any subpath), so there is no absolute
 * path an app can reference that could ever "escape" - the entire bug
 * class is structurally impossible now, not just patched case by case.
 */

/** Instruction text every employee's system prompt gets, once (see bootstrap-employees.mjs). */
export const LIVE_APP_INSTRUCTIONS = `## Running a Live Application For Owner Review

If the owner needs to use your actual running application (not just view
static files - see the separate file-preview instructions for that
case), follow these steps in order:

### 1. Get your project's dedicated port

Every project gets its own permanent, dedicated port - ask for it
(replace {project-slug} with your project's actual working-directory
name, e.g. "acme-app" if your directory is /projects/acme-app):

  curl -s http://mkdd-ui:8787/api/projects/{project-slug}/live-port

This returns \`{"port": 4005}\` (an example - yours will likely differ).
This port is permanently yours for this project - the same call always
returns the same number.

### 2. Start your server on that exact port, bound to all interfaces, in the background

**Critical: start it as a true background process, not a foreground
command.** Your terminal tool runs commands in a persistent session - a
foreground server command occupies that session completely, and it gets
interrupted the moment you (or anything else) runs another command in
it. Always background it explicitly and detach it from the session,
redirecting output to a log file so you can still check on it. Replace
4005 below with your own actual assigned port:

  nohup npm start -- --port 4005 --host 0.0.0.0 > /tmp/live-app.log 2>&1 &
  nohup python manage.py runserver 0.0.0.0:4005 > /tmp/live-app.log 2>&1 &

### 3. Verify it before telling the owner anything

Never assume the start command worked - confirm it:

  sleep 2 && curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:4005/

If it didn't start (connection refused, or an unexpected status), check
the log file first: \`cat /tmp/live-app.log\` - diagnose and fix the
real problem before telling the owner anything is ready.

### 4. Share the link

Once verified, share a link in this exact form as plain text (replace
4005 with your actual port, and the path with whatever page you want
the owner to see - or leave it empty for your app's root):

  /live-port/4005/admin

Do NOT construct a full URL yourself (e.g. don't write
"http://192.168.2.18:4005/admin") - you don't reliably know the address
the owner is actually browsing from. Share exactly the
/live-port/{port}/{path} form above; MKDD's own interface turns it into
the correct, clickable link automatically.

### Important notes

- Because your app is reached directly on its own dedicated port (not
  through any shared path prefix), it works exactly as if it were
  running at its own real root - no special basePath/publicPath
  configuration needed in your app, regardless of framework.
- The port is reserved specifically for this project going forward -
  restarting your server later, even in a new conversation, should use
  the same port (ask again with step 1 if you're unsure; it always
  returns the same value for the same project).
- The app must actually be running for the link to work - if your
  server stops, or was never properly backgrounded and got interrupted,
  the owner's browser will simply fail to connect (a plain
  connection-refused, not a fabricated success).

### Host/origin allowlisting - a real gap to check proactively

The owner reaches your app through the VM's actual real address (e.g.
\`192.168.2.18:4005\`), not \`localhost\`. If your framework has a
security setting that validates the incoming Host/Origin header against
an allowlist - Django's \`ALLOWED_HOSTS\`, Rails' host authorization,
Next.js \`allowedDevOrigins\`, or similar in other frameworks - and that
setting only includes \`localhost\`/\`127.0.0.1\` (a very common default),
the owner's browser will hit a real rejection error the moment they try
the link, even though your server itself started and ran successfully.

Check for this proactively before sharing the link, not after the owner
reports an error: configure the allowlist to accept any host for this
preview environment (e.g. Django: \`ALLOWED_HOSTS = ["*"]\`) - this is an
internal preview environment, not a production deployment, so a
permissive setting here is appropriate and expected.`;
