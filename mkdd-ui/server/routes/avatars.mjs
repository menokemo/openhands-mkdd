import fs from "node:fs";
import path from "node:path";
import { listEmployeeNames } from "../lib/list-employee-definitions.mjs";

const AVATARS_DIR = "/mkdd-data/avatars";

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

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}

/**
 * Finds the actual avatar file for an employee on disk, trying every
 * allowed extension, since we don't force a single format at upload time.
 * Returns null if no avatar has ever been uploaded - the frontend must
 * fall back to the letter placeholder in that case rather than pointing
 * at a URL that 404s (the bug this route fixes: avatarUrl previously
 * always pointed at a non-existent /avatars/{name}.webp).
 */
export function findEmployeeAvatarFile(employeeId) {
  for (const ext of Object.values(ALLOWED_MIME_TO_EXT)) {
    const file = path.join(AVATARS_DIR, `${employeeId}.${ext}`);
    if (fs.existsSync(file)) return { file, ext };
  }
  return null;
}

/** GET /avatars/{employeeId} — serves the uploaded avatar, if any. */
export async function handleServeAvatar(req, res) {
  if (!(req.method === "GET" && req.url?.startsWith("/avatars/"))) return false;

  const employeeId = decodeURIComponent(req.url.slice("/avatars/".length));
  const found = findEmployeeAvatarFile(employeeId);

  if (!found) {
    res.writeHead(404);
    res.end();
    return true;
  }

  res.writeHead(200, { "content-type": CONTENT_TYPE_BY_EXT[found.ext] });
  fs.createReadStream(found.file).pipe(res);
  return true;
}

/**
 * POST /api/employees/{employeeId}/avatar
 * Body: { imageDataUrl: "data:image/png;base64,...." }
 *
 * Accepts a data URL rather than multipart form data - this keeps the
 * backend dependency-free (no multipart parser needed) and matches how
 * a simple <input type="file"> + FileReader upload works from the browser.
 */
export async function handleUploadAvatar(req, res) {
  const match = req.url?.match(/^\/api\/employees\/([^/]+)\/avatar$/);
  if (!(req.method === "POST" && match)) return false;

  const employeeId = decodeURIComponent(match[1]);

  if (!listEmployeeNames().includes(employeeId)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "employee_not_found" }));
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
  // re-upload in a new format doesn't leave a stale duplicate file that
  // findEmployeeAvatarFile() might return instead of the new one.
  const existing = findEmployeeAvatarFile(employeeId);
  if (existing) fs.rmSync(existing.file, { force: true });

  const ext = ALLOWED_MIME_TO_EXT[mime];
  const file = path.join(AVATARS_DIR, `${employeeId}.${ext}`);
  fs.writeFileSync(file, buffer);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ avatarUrl: `/avatars/${employeeId}` }));
  return true;
}
