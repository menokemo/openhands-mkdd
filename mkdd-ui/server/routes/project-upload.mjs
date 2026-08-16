import fs from "node:fs";
import path from "node:path";
import { resolveProjectDir } from "../lib/project-paths.mjs";

// Generous enough for real product photography (not just small avatar/
// chat-bubble images), but still bounded - matches the spirit of the
// existing avatar/chat-image limits (avatars.mjs, chat.mjs) rather than
// introducing an unrelated new number.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES_PER_UPLOAD = 10;

// Files uploaded here are readable/writable, not scripts we'd ever
// execute ourselves - the real risk is a path-traversal filename, not
// content type, so this stays permissive on type but strict on the
// resolved path (see resolveUploadTarget below).
const FORBIDDEN_FILENAME_CHARS = /[/\\]/;

/**
 * Resolves an uploaded file's on-disk destination, guaranteed to stay
 * inside {project}/uploads/ - guards against a filename containing path
 * separators (e.g. "../../etc/passwd") the same way preview.mjs guards
 * against traversal in the read direction. Exported separately so this
 * security-relevant logic can be unit-tested without real files/network.
 */
export function resolveUploadTarget(projectSlug, filename) {
  const projectDir = resolveProjectDir(projectSlug);
  if (!projectDir) return null;
  if (!filename || FORBIDDEN_FILENAME_CHARS.test(filename)) return null;
  if (filename === "." || filename === "..") return null;

  const uploadsDir = path.join(projectDir, "uploads");
  const targetPath = path.join(uploadsDir, filename);

  const uploadsDirWithSep = uploadsDir.endsWith(path.sep)
    ? uploadsDir
    : uploadsDir + path.sep;
  if (!targetPath.startsWith(uploadsDirWithSep)) return null;

  return { uploadsDir, targetPath };
}

function parseDataUrl(dataUrl) {
  const match =
    typeof dataUrl === "string" && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

/**
 * POST /api/projects/{projectSlug}/upload — the owner uploads real
 * project assets (product photos, reference documents, etc.) directly
 * into the project's own shared directory (/projects/{slug}/uploads/),
 * not into any single employee's conversation. Since every employee's
 * sandbox already sees this same directory (it's their own project's
 * working directory), an uploaded file is immediately visible/usable
 * by any employee without needing to be re-shared per-conversation -
 * and it shows up automatically in the existing Project Files section
 * (project-files.mjs) and is viewable via the existing preview route
 * (preview.mjs), with no separate viewing mechanism needed.
 */
export async function handleProjectUpload(req, res) {
  const match = req.url?.match(/^\/api\/projects\/([^/]+)\/upload$/);
  if (!(req.method === "POST" && match)) return false;

  const projectSlug = decodeURIComponent(match[1]);

  let body = "";
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_json" }));
    return true;
  }

  const files = Array.isArray(payload?.files) ? payload.files : null;
  if (!files || files.length === 0) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no_files" }));
    return true;
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "too_many_files" }));
    return true;
  }

  const saved = [];
  for (const file of files) {
    const parsed = parseDataUrl(file?.dataUrl);
    if (!parsed) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_file_data", filename: file?.name }));
      return true;
    }

    const approxBytes = (parsed.base64.length * 3) / 4;
    if (approxBytes > MAX_UPLOAD_BYTES) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "file_too_large", filename: file?.name }));
      return true;
    }

    const target = resolveUploadTarget(projectSlug, file?.name);
    if (!target) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_filename", filename: file?.name }));
      return true;
    }

    fs.mkdirSync(target.uploadsDir, { recursive: true, mode: 0o777 });
    fs.writeFileSync(target.targetPath, Buffer.from(parsed.base64, "base64"));
    // Match projects.mjs's own reasoning for chmod after creation: the
    // container's non-root openhands user needs write access into a
    // directory MKDD itself (running as a different user) just created.
    fs.chmodSync(target.targetPath, 0o666);

    saved.push(`uploads/${file.name}`);
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ saved }));
  return true;
}
