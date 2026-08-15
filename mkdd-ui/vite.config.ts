import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
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
      // Live app reverse proxy (server/routes/live-proxy.mjs). First
      // version covers plain HTTP requests only - the target app's own
      // WebSocket-based hot-reload (if any) won't work through this,
      // since the backend doesn't handle WS upgrades on this path yet.
      "/live": {
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
