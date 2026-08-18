/**
 * Reads and parses a request body as JSON. Shared helper - was
 * previously duplicated locally inside workflow.mjs; extracted here so
 * new routes (e.g. push.mjs) can reuse it instead of redefining it.
 */
export async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}
