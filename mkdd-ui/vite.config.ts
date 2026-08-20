import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite's dev server rejects requests whose Host header isn't in this
// list, as a DNS-rebinding protection - relevant only when actually
// running the dev server (e.g. a developer running `npm run dev`
// locally outside Docker; the deployed container runs a real
// production build - see #123 - and never runs the dev server at
// all). No domain is ever hardcoded in this source file (committed to
// a public GitHub repo) - set MKDD_ALLOWED_HOSTS in your own local
// .env if you need this for local development.
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
