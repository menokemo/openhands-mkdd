import {
  hasAnyUser,
  createUser,
  verifyCredentials,
  createSession,
  getSessionUser,
  destroySession,
  listUsers,
  removeUser,
} from "../lib/auth-store.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";

const COOKIE_NAME = "mkdd_session";

export function parseSessionToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

function setSessionCookie(res, token) {
  // HttpOnly (JS can never read it - real XSS mitigation) + SameSite=Lax
  // (blocks it being sent on most cross-site requests, a real CSRF
  // mitigation). Not marked Secure: this server is reached over plain
  // HTTP internally even in production (NPM/any reverse proxy
  // terminates HTTPS and forwards over HTTP - see README's own
  // architecture notes), so forcing Secure would break the cookie on
  // every request path this app actually uses, local IP included.
  const maxAgeSeconds = 90 * 24 * 60 * 60;
  res.setHeader(
    "set-cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "set-cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

/**
 * The current visitor's authenticated user, or null. Exported so
 * index.mjs's request gate (BUGS_AND_FIXES.md #127) can check it
 * before letting a request reach any protected route.
 */
export function currentUser(req) {
  return getSessionUser(parseSessionToken(req));
}

/**
 * GET /api/auth/status — tells the frontend which of three states
 * apply: no account exists yet (show the one-time setup screen), an
 * account exists but this visitor isn't logged in (show the login
 * screen), or already logged in (show the real app).
 */
export async function handleAuthStatus(req, res) {
  if (!(req.method === "GET" && req.url === "/api/auth/status")) return false;

  const user = currentUser(req);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      setupRequired: !hasAnyUser(),
      loggedIn: user !== null,
      username: user?.username ?? null,
    }),
  );
  return true;
}

/**
 * POST /api/auth/setup — creates the very first account. Only allowed
 * while zero users exist at all; once any account exists, this always
 * rejects (use the authenticated add-user endpoint instead), so a
 * stranger who reaches an already-configured instance can never
 * silently create their own account through this endpoint.
 */
export async function handleAuthSetup(req, res) {
  if (!(req.method === "POST" && req.url === "/api/auth/setup")) return false;

  if (hasAnyUser()) {
    res.writeHead(409, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "setup_already_complete" }));
    return true;
  }

  const { username, password } = await readJsonBody(req);

  try {
    const user = createUser(username ?? "", password ?? "");
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ username: user.username }));
  } catch (err) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
  return true;
}

export async function handleAuthLogin(req, res) {
  if (!(req.method === "POST" && req.url === "/api/auth/login")) return false;

  const { username, password } = await readJsonBody(req);
  const user = verifyCredentials(username ?? "", password ?? "");

  if (!user) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_credentials" }));
    return true;
  }

  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ username: user.username }));
  return true;
}

export async function handleAuthLogout(req, res) {
  if (!(req.method === "POST" && req.url === "/api/auth/logout")) return false;

  const token = parseSessionToken(req);
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
  return true;
}

/** GET /api/auth/users — list team members with access (requires login). */
export async function handleAuthListUsers(req, res) {
  if (!(req.method === "GET" && req.url === "/api/auth/users")) return false;

  // Reached only if already past index.mjs's auth gate (this route
  // itself requires login, same as every other /api/ route besides
  // status/setup/login).
  const users = listUsers().map((u) => ({ id: u.id, username: u.username }));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ users }));
  return true;
}

/** POST /api/auth/users — adds another user (requires being already logged in). */
export async function handleAuthAddUser(req, res) {
  if (!(req.method === "POST" && req.url === "/api/auth/users")) return false;

  const { username, password } = await readJsonBody(req);

  try {
    const user = createUser(username ?? "", password ?? "");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: user.id, username: user.username }));
  } catch (err) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
  return true;
}

/** POST /api/auth/users/remove — removes a user's access. */
export async function handleAuthRemoveUser(req, res) {
  if (!(req.method === "POST" && req.url === "/api/auth/users/remove")) return false;

  const { userId } = await readJsonBody(req);
  if (!userId) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "userId_required" }));
    return true;
  }

  removeUser(userId);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
  return true;
}
