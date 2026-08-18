import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite's dev server rejects requests whose Host header isn't in this
// list, as a DNS-rebinding protection - this is a real security
// feature, not something to disable outright. Reading it from an
// env var (not hardcoding a domain in this source file, which is
// committed to a public GitHub repo) means the actual domain lives
// only in this deployment's own compose.yml/.env, and changing it
// later is a one-line env var change + restart, never a code change
// (BUGS_AND_FIXES.md #108).
const allowedHosts = process.env.MKDD_ALLOWED_HOSTS
  ? process.env.MKDD_ALLOWED_HOSTS.split(",").map((host) => host.trim())
  : undefined;

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
