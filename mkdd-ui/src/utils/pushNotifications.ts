// Push notification setup (BUGS_AND_FIXES.md #107). The Notification,
// Push, and Service Worker APIs all require a secure context (HTTPS) -
// every function here checks for that and simply does nothing instead
// of throwing when it's missing, which is exactly the current state
// (plain HTTP). Nothing here needs to change once HTTPS is set up via
// NPM + a certificate - it activates automatically.

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Registers the Service Worker (idempotent - safe to call on every app
 * load). Silently returns null if unsupported (plain HTTP) rather than
 * throwing, since this runs unconditionally at startup.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;

  try {
    return await navigator.serviceWorker.register("/service-worker.js");
  } catch {
    return null;
  }
}

/**
 * Requests notification permission, subscribes to push, and sends the
 * subscription to the backend for storage. Returns whether it actually
 * succeeded, so the calling UI can show a clear success/failure state
 * rather than silently doing nothing.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  try {
    const { publicKey } = await fetch("/api/push/vapid-public-key").then((r) => r.json());
    if (!publicKey) return false;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });

    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return r.ok;
  } catch {
    return false;
  }
}
