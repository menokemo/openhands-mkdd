import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";

// Same persistence directory as workflow-state.mjs (BUGS_AND_FIXES.md
// #107) - VAPID keys are generated once and must stay stable across
// restarts, since regenerating them invalidates every browser's
// existing push subscription (the subscription is cryptographically
// tied to the public key it was created with).
const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const VAPID_FILE = path.join(STATE_DIR, "push-vapid-keys.json");
const SUBSCRIPTIONS_FILE = path.join(STATE_DIR, "push-subscriptions.json");

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * Returns the persisted VAPID key pair, generating and saving one on
 * first use. Safe to call repeatedly - subsequent calls just read the
 * same file.
 */
export function getVapidKeys() {
  ensureDir();

  if (fs.existsSync(VAPID_FILE)) {
    return JSON.parse(fs.readFileSync(VAPID_FILE, "utf-8"));
  }

  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
  return keys;
}

function readSubscriptions() {
  if (!fs.existsSync(SUBSCRIPTIONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeSubscriptions(subscriptions) {
  ensureDir();
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

/**
 * Adds a new push subscription (one per browser/device that opts in -
 * a single owner may have several: phone, laptop, etc.). De-duplicates
 * by endpoint, so re-subscribing the same browser just updates its
 * entry rather than creating a duplicate.
 */
export function addSubscription(subscription) {
  const subscriptions = readSubscriptions();
  const withoutExisting = subscriptions.filter(
    (s) => s.endpoint !== subscription.endpoint,
  );
  withoutExisting.push(subscription);
  writeSubscriptions(withoutExisting);
}

export function getAllSubscriptions() {
  return readSubscriptions();
}

/** Removes a subscription that the push service reports as expired/invalid. */
export function removeSubscription(endpoint) {
  const subscriptions = readSubscriptions();
  writeSubscriptions(subscriptions.filter((s) => s.endpoint !== endpoint));
}
