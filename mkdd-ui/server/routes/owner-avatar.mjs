import fs from "node:fs";
import path from "node:path";
import { currentUser } from "./auth.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import {
  findOwnerAvatarFile,
  buildOwnerAvatarUrl,
  AVATARS_DIR,
} from "../lib/owner-avatar-store.mjs";

const ALLOWED_MIME_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const CONTENT_TYPE_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

/** GET /avatars/owner/{userId}[?v=...] — serves a user's avatar, if any. */
export async function handleServeOwnerAvatar(req, res) {
  if (!(req.method === "GET" && req.url?.startsWith("/avatars/owner/"))) return false;

  const url = new URL(req.url, "http://mkdd.local");
  const userId = decodeURIComponent(url.pathname.slice("/avatars/owner/".length));
  const found = findOwnerAvatarFile(userId);

  if (!found) {
    res.writeHead(404);
    res.end();
    return true;
  }

  // Version-stamped URL (see buildOwnerAvatarUrl) - safe to cache
  // aggressively, same reasoning as the employee avatar route.
  res.writeHead(200, {
    "content-type": CONTENT_TYPE_BY_EXT[found.ext],
    "cache-control": "public, max-age=31536000, immutable",
  });
  fs.createReadStream(found.file).pipe(res);
  return true;
}

/**
 * POST /api/auth/me/avatar
 * Body: { imageDataUrl: "data:image/png;base64,...." }
 *
 * Uploads (or replaces) the CURRENTLY LOGGED-IN user's own avatar -
 * the user is always taken from the session (currentUser), never from
 * a URL parameter or request body, so there is no way for one user to
 * upload a photo onto another user's account.
 */
export async function handleUploadOwnerAvatar(req, res) {
  if (!(req.method === "POST" && req.url === "/api/auth/me/avatar")) return false;

  const user = currentUser(req);
  // Reached only if already past index.mjs's auth gate, but checked
  // again explicitly here since a null user would otherwise crash
  // below rather than fail cleanly.
  if (!user) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_authenticated" }));
    return true;
  }

  const { imageDataUrl } = await readJsonBody(req);
  const dataUrlMatch =
    typeof imageDataUrl === "string" &&
    imageDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);

  if (!dataUrlMatch) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_image_data_url" }));
    return true;
  }

  const [, mime, base64Payload] = dataUrlMatch;
  const buffer = Buffer.from(base64Payload, "base64");

  if (buffer.byteLength > MAX_AVATAR_BYTES) {
    res.writeHead(413, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "image_too_large" }));
    return true;
  }

  fs.mkdirSync(AVATARS_DIR, { recursive: true });

  // Remove any existing avatar under a DIFFERENT extension first, so a
  // re-upload in a new format doesn't leave a stale duplicate file.
  const existing = findOwnerAvatarFile(user.id);
  if (existing) fs.rmSync(existing.file, { force: true });

  const ext = ALLOWED_MIME_TO_EXT[mime];
  const file = path.join(AVATARS_DIR, `${user.id}.${ext}`);
  fs.writeFileSync(file, buffer);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ avatarUrl: buildOwnerAvatarUrl(user.id) }));
  return true;
}
