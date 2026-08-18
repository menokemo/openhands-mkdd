// MKDD Service Worker
//
// Scope: enables Web Push notifications only. MKDD's core value (live
// chat with AI employees) requires an active network connection anyway,
// so no offline-caching strategy is attempted here - a caching layer
// would add real complexity (versioning, staleness) for no real benefit
// to this app.
//
// Both the Push API and this Service Worker itself require a secure
// context (HTTPS) - see BUGS_AND_FIXES.md #107. This file works exactly
// as-is once the deployment is served over HTTPS; nothing here needs to
// change for that to happen.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "MKDD", body: event.data.text() };
  }

  const title = payload.title || "MKDD";
  const options = {
    body: payload.body || "",
    icon: "/api/branding/icon-192.png",
    badge: "/api/branding/icon-192.png",
    data: { url: payload.url || "/" },
    // Group notifications about the same employee/project so a burst
    // of messages doesn't spam the notification tray - the newest one
    // replaces the previous with the same tag.
    tag: payload.tag || "mkdd-notification",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
