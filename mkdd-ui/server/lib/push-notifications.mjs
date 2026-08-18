import webpush from "web-push";
import { getVapidKeys, getAllSubscriptions, removeSubscription } from "../push-state.mjs";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const { publicKey, privateKey } = getVapidKeys();
  // The contact email is required by the Web Push protocol (part of
  // the VAPID "mailto:" subject) but never actually contacts anyone -
  // it's a courtesy contact push services may use if a subscription is
  // misbehaving.
  webpush.setVapidDetails("mailto:owner@mkdd.local", publicKey, privateKey);
  configured = true;
}

/**
 * Sends a push notification to every subscribed browser/device
 * (BUGS_AND_FIXES.md #107). Fires in parallel and never throws - a
 * failed push (network issue, or the browser/OS having revoked the
 * subscription) must never block or crash the caller (e.g. the message
 * send flow that triggers this).
 */
export async function sendPushToAll({ title, body, url, tag }) {
  try {
    ensureConfigured();

    const subscriptions = getAllSubscriptions();
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body, url, tag });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, payload);
        } catch (err) {
          // 404/410 = the push service confirms this subscription no
          // longer exists (permission revoked, browser data cleared,
          // etc.) - clean it up so future sends don't keep retrying it.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            removeSubscription(subscription.endpoint);
          }
        }
      }),
    );
  } catch {
    // VAPID key loading/configuration failure, or any other unexpected
    // error - this function's contract is "never throws" (callers use
    // it as "void sendPushToAll(...)" from real-time message/report
    // triggers), so nothing here is allowed to escape as an unhandled
    // rejection.
  }
}
