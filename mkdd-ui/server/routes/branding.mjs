import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { OPENHANDS_URL } from "../lib/openhands-client.mjs";

const LOGO_FILE = "/mkdd-data/branding/mkdd-logo.png";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_SVG = path.join(__dirname, "..", "..", "public", "favicon.svg");

export async function handleBranding(req, res) {
  if (req.url !== "/api/branding/logo") return false;

  if (!fs.existsSync(LOGO_FILE)) {
    res.writeHead(404);
    res.end();
    return true;
  }

  res.writeHead(200, { "content-type": "image/png" });
  fs.createReadStream(LOGO_FILE).pipe(res);
  return true;
}

/**
 * PWA icons (BUGS_AND_FIXES.md #113) - generated on the fly from the
 * REAL branding logo (the same file shown in the app header) once an
 * owner has uploaded one, not a separate static asset that could
 * silently drift out of sync with it. Before any logo is uploaded,
 * falls back to the bundled SVG so manifest.json never points at a
 * broken image either way. fit:"contain" on a transparent square
 * canvas avoids distorting or cropping a source image that isn't
 * already perfectly square (the earlier icon generation attempt from
 * the raw SVG had exactly that problem - see #107's fix).
 */
export async function handleBrandingIcon(req, res) {
  const match = req.url?.match(/^\/api\/branding\/icon-(192|512)\.png$/);
  if (!match) return false;

  const size = Number(match[1]);
  const source = fs.existsSync(LOGO_FILE) ? LOGO_FILE : FALLBACK_SVG;

  try {
    const buffer = await sharp(source)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    res.writeHead(200, { "content-type": "image/png" });
    res.end(buffer);
  } catch {
    res.writeHead(500);
    res.end();
  }
  return true;
}

export async function handleHealth(req, res) {
  if (req.url !== "/api/health") return false;

  const r = await fetch(OPENHANDS_URL + "/ready");
  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(await r.text());
  return true;
}
