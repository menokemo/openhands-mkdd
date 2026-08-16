/**
 * Employee instructions for MKDD's real live-app preview mechanism
 * (BUGS_AND_FIXES.md #51).
 *
 * Complements PREVIEW_INSTRUCTIONS (preview-instructions.mjs), which
 * covers STATIC files only (HTML/CSS/JS/images with no server needed).
 * This covers the opposite case: a real, running application (a real
 * backend, a real dev server) that the owner needs to actually use
 * live, not just view as static files.
 */

/** Instruction text every employee's system prompt gets, once (see bootstrap-employees.mjs). */
export const LIVE_APP_INSTRUCTIONS = `## Running a Live Application For Owner Review

If the owner needs to use your actual running application (not just view
static files - see the separate file-preview instructions for that
case), start your app's server bound to port 4001 on all interfaces:

  0.0.0.0:4001

**Critical: start it as a true background process, not a foreground
command.** Your terminal tool runs commands in a persistent session - a
foreground server command occupies that session completely, and it gets
interrupted the moment you (or anything else) runs another command in
it. Always background it explicitly and detach it from the session,
redirecting output to a log file so you can still check on it:

  nohup npm start -- --port 4001 --host 0.0.0.0 > /tmp/live-app.log 2>&1 &
  nohup python manage.py runserver 0.0.0.0:4001 > /tmp/live-app.log 2>&1 &

After starting it this way, verify it is actually listening before
telling the owner it's ready:

  sleep 2 && curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:4001/

If you need to see what happened (it crashed, didn't start, etc.), check
the log file: \`cat /tmp/live-app.log\`.

The owner can then reach it directly at:

/live/{project-slug}/{path}

Example: if your project's working directory is \`/projects/acme-app\`,
the owner reaches your app's root at \`/live/acme-app/\`, and any route
inside it (e.g. \`/dashboard\`) at \`/live/acme-app/dashboard\`.

Important constraints:
- Port 4001 is shared across the whole company - only one project's
  live app is reachable at a time (whichever one is currently running
  on that port). If another employee's app was using it, yours simply
  replaces it as soon as your server starts.
- The app must actually be running for the link to work - if you stop
  your server, or it was never properly backgrounded and got
  interrupted, the owner will see a clear "no live server running"
  message instead of your app. Before telling the owner a link is
  ready, always verify with the curl check above first - don't just
  assume the start command worked.
- This proxies plain HTTP requests only. If your app relies on its own
  WebSocket connection (e.g. some frameworks' hot-reload), that specific
  feature won't work through this - a normal page load/refresh, and any
  other server communication your app itself makes, works normally.`;
