import fs from "node:fs";
import { OPENHANDS_URL } from "../lib/openhands-client.mjs";

export async function handleBranding(req, res) {
  if (req.url !== "/api/branding/logo") return false;

  const file = "/mkdd-data/branding/mkdd-logo.png";
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return true;
  }

  res.writeHead(200, { "content-type": "image/png" });
  fs.createReadStream(file).pipe(res);
  return true;
}

export async function handleHealth(req, res) {
  if (req.url !== "/api/health") return false;

  const r = await fetch(OPENHANDS_URL + "/ready");
  res.writeHead(r.status, { "content-type": "application/json" });
  res.end(await r.text());
  return true;
}
