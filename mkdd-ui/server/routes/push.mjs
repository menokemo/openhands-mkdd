import { getVapidKeys, addSubscription } from "../push-state.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";

/**
 * GET /api/push/vapid-public-key — the browser needs this to call
 * pushManager.subscribe(). Only the PUBLIC key is ever exposed here;
 * the private key stays server-side (see push-state.mjs).
 */
export async function handlePushVapidKey(req, res) {
  if (!(req.method === "GET" && req.url === "/api/push/vapid-public-key")) {
    return false;
  }

  const { publicKey } = getVapidKeys();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ publicKey }));
  return true;
}

/**
 * POST /api/push/subscribe — stores a browser's push subscription
 * object (from pushManager.subscribe()) so future notifications can be
 * sent to it. This endpoint itself works over plain HTTP, but the
 * browser will never actually be able to call pushManager.subscribe()
 * in the first place without HTTPS (see BUGS_AND_FIXES.md #107) - so
 * in practice this only ever receives real calls once HTTPS is set up.
 */
export async function handlePushSubscribe(req, res) {
  if (!(req.method === "POST" && req.url === "/api/push/subscribe")) {
    return false;
  }

  const { subscription } = await readJsonBody(req);

  if (!subscription?.endpoint) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "subscription_required" }));
    return true;
  }

  addSubscription(subscription);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
  return true;
}
