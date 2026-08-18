import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Vite's dev server rejects requests whose Host header isn't in this
// list, as a DNS-rebinding protection - this is a real security
// feature, not something to disable outright. No domain is ever
// hardcoded in this source file (committed to a public GitHub repo) -
// the allow-list comes from TWO possible sources, unioned together:
//
// 1. The MKDD_ALLOWED_HOSTS env var (BUGS_AND_FIXES.md #108) -
//    configured once in compose.yml/.env at deploy time.
// 2. A domain the owner adds from the running app's UI
//    (BUGS_AND_FIXES.md #109), persisted to mkdd-data/site-config.json.
//    This file is only ever read here, at Vite startup - saving a
//    domain from the UI does NOT take effect live, exactly why that
//    UI explicitly tells the owner a restart is required.
const envHosts = process.env.MKDD_ALLOWED_HOSTS
  ? process.env.MKDD_ALLOWED_HOSTS.split(",").map((host) => host.trim())
  : [];

function readPersistedHosts(): string[] {
  const configFile = path.join(
    process.env.MKDD_DATA_DIR ?? "/mkdd-data",
    "site-config.json",
  );
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    return Array.isArray(parsed.allowedHosts) ? parsed.allowedHosts : [];
  } catch {
    return [];
  }
}

const combinedHosts = [...new Set([...envHosts, ...readPersistedHosts()])];
const allowedHosts = combinedHosts.length > 0 ? combinedHosts : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      // Employee avatars are served from a top-level /avatars/* route
      // (server/routes/avatars.mjs), not under /api - without this proxy
      // rule, the dev server has no route for it and the browser gets
      // Vite's SPA fallback (index.html) instead of the image, which
      // renders as a broken-image icon. Confirmed live: a direct curl to
      // the backend (bypassing Vite) always returned the image correctly
      // (200, image/jpeg) while the same URL through the browser/Vite
      // failed even after a hard refresh - ruling out caching and
      // pointing at exactly this missing proxy rule.
      "/avatars": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      "/preview": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
