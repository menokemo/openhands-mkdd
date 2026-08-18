// Mirrors server/routes/settings.mjs's isLocalHostRequest exactly
// (BUGS_AND_FIXES.md #112) - purely cosmetic here (hides the Settings
// menu item when opened via the public domain), the REAL enforcement
// is server-side. Hiding a button alone would provide no actual
// security, since the API endpoints themselves would still be fully
// reachable by anyone who found the URL directly.
export function isLocalAccess(): boolean {
  const host = window.location.hostname;

  if (host === "localhost" || host === "127.0.0.1") return true;

  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}
