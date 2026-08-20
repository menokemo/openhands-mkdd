import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Same persistence directory as workflow-state.mjs/push-state.mjs
// (BUGS_AND_FIXES.md #127).
const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const USERS_FILE = path.join(STATE_DIR, "auth-users.json");
const SESSIONS_FILE = path.join(STATE_DIR, "auth-sessions.json");

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  // Constant-time comparison - avoids leaking hash-match progress via
  // response timing, standard practice for credential comparison.
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function listUsers() {
  return readJson(USERS_FILE, []);
}

export function hasAnyUser() {
  return listUsers().length > 0;
}

export function findUserByUsername(username) {
  const normalized = username.trim().toLowerCase();
  return listUsers().find((u) => u.username.toLowerCase() === normalized) ?? null;
}

/**
 * Creates a new user. The very first user is created via the one-time
 * setup screen (no auth required yet, since no account exists to log
 * in with); every subsequent user must be added by an already-
 * logged-in user (see routes/auth.mjs's requireAuth-gated add-user
 * endpoint), preventing anyone who merely reaches the app from
 * silently registering their own account after setup is done.
 */
export function createUser(username, password) {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("username_required");
  if (!password || password.length < 8) throw new Error("password_too_short");
  if (findUserByUsername(trimmed)) throw new Error("username_taken");

  const users = listUsers();
  const user = {
    id: crypto.randomUUID(),
    username: trimmed,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeJson(USERS_FILE, users);
  return { id: user.id, username: user.username };
}

export function removeUser(userId) {
  const users = listUsers();
  const next = users.filter((u) => u.id !== userId);
  writeJson(USERS_FILE, next);
}

/** Returns { id, username } on success, null on invalid credentials. */
export function verifyCredentials(username, password) {
  const user = findUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return { id: user.id, username: user.username };
}

function readSessions() {
  return readJson(SESSIONS_FILE, []);
}

function writeSessions(sessions) {
  writeJson(SESSIONS_FILE, sessions);
}

/** Creates a new session for a user, returning the token to set as a cookie. */
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const sessions = readSessions().filter((s) => s.expiresAt > Date.now()); // prune expired while we're here
  sessions.push({
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  writeSessions(sessions);
  return token;
}

/** Returns the { id, username } for a valid, non-expired session token, or null. */
export function getSessionUser(token) {
  if (!token) return null;
  const session = readSessions().find((s) => s.token === token);
  if (!session || session.expiresAt <= Date.now()) return null;
  const user = listUsers().find((u) => u.id === session.userId);
  return user ? { id: user.id, username: user.username } : null;
}

export function destroySession(token) {
  const sessions = readSessions().filter((s) => s.token !== token);
  writeSessions(sessions);
}
