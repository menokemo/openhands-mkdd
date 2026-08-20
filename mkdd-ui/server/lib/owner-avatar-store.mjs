import fs from "node:fs";
import path from "node:path";

const AVATARS_DIR = "/mkdd-data/owner-avatars";

const EXTENSIONS = ["png", "jpg", "webp"];

/**
 * Finds a user's uploaded avatar file on disk, trying every allowed
 * extension (same pattern as findEmployeeAvatarFile in avatars.mjs).
 * Returns null if this user has never uploaded one.
 */
export function findOwnerAvatarFile(userId) {
  for (const ext of EXTENSIONS) {
    const file = path.join(AVATARS_DIR, `${userId}.${ext}`);
    if (fs.existsSync(file)) return { file, ext };
  }
  return null;
}

/**
 * Builds the public avatar URL with a cache-busting ?v= param (same
 * reasoning as buildEmployeeAvatarUrl in avatars.mjs - without it, a
 * browser that already tried a URL once could keep serving a stale
 * cached result after a re-upload).
 */
export function buildOwnerAvatarUrl(userId) {
  const found = findOwnerAvatarFile(userId);
  if (!found) return null;

  const mtimeMs = Math.round(fs.statSync(found.file).mtimeMs);
  return `/avatars/owner/${userId}?v=${mtimeMs}`;
}

export { AVATARS_DIR };
