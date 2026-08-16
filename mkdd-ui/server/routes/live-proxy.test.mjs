import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLiveProxyPath, rewriteLiveAppHtml } from "./live-proxy.mjs";

test("splits project slug and forward path for a nested route", () => {
  const result = parseLiveProxyPath("my-app/api/users?x=1");
  assert.equal(result.projectSlug, "my-app");
  assert.equal(result.forwardPath, "/api/users?x=1");
});

test("defaults forward path to / for a bare project request", () => {
  const result = parseLiveProxyPath("my-app");
  assert.equal(result.projectSlug, "my-app");
  assert.equal(result.forwardPath, "/");
});

test("defaults forward path to / for a project with a trailing slash", () => {
  const result = parseLiveProxyPath("my-app/");
  assert.equal(result.projectSlug, "my-app");
  assert.equal(result.forwardPath, "/");
});

test("preserves query strings and deep paths", () => {
  const result = parseLiveProxyPath("acme/docs/design/palette.html?theme=dark");
  assert.equal(result.projectSlug, "acme");
  assert.equal(result.forwardPath, "/docs/design/palette.html?theme=dark");
});

test("rewrites an href attribute pointing to a known absolute asset prefix", () => {
  const html = '<link rel="stylesheet" href="/_next/static/chunks/x.css"/>';
  const result = rewriteLiveAppHtml(html, "acme-app");
  assert.equal(
    result,
    '<link rel="stylesheet" href="/live/acme-app/_next/static/chunks/x.css"/>',
  );
});

test("rewrites a src attribute the same way", () => {
  const html = '<script src="/_next/static/chunks/main.js"></script>';
  const result = rewriteLiveAppHtml(html, "acme-app");
  assert.equal(
    result,
    '<script src="/live/acme-app/_next/static/chunks/main.js"></script>',
  );
});

test("rewrites the same path pattern when embedded inside inline JS/JSON (not just HTML attributes) - matches real Next.js RSC payloads", () => {
  const html =
    '<script>self.__next_f.push([1,"path:\\"/_next/static/chunks/foo.js\\""])</script>';
  const result = rewriteLiveAppHtml(html, "acme-app");
  assert.ok(result.includes('\\"/live/acme-app/_next/static/chunks/foo.js\\"'));
});

test("rewrites multiple different known prefixes in the same document", () => {
  const html = '<link href="/static/a.css"/><img src="/assets/b.png"/>';
  const result = rewriteLiveAppHtml(html, "x");
  assert.ok(result.includes('href="/live/x/static/a.css"'));
  assert.ok(result.includes('src="/live/x/assets/b.png"'));
});

test("leaves unrelated content untouched", () => {
  const html = "<p>hello world, no asset paths here</p>";
  assert.equal(rewriteLiveAppHtml(html, "x"), html);
});

test("does not rewrite a path that merely CONTAINS the prefix substring without a quote/paren immediately before it", () => {
  // Guards against over-eager replacement - only rewrite when the prefix
  // genuinely starts a quoted/parenthesized reference, not any
  // occurrence of the substring anywhere in the page text.
  const html = "<p>see /_next/ for details</p>";
  assert.equal(rewriteLiveAppHtml(html, "x"), html);
});

test("real end-to-end: a chunked (streaming) HTML response gets rewritten with consistent headers, not a Content-Length/Transfer-Encoding conflict", async () => {
  const http = await import("node:http");
  const fs = await import("node:fs");

  // handleLiveProxy validates the project against the real /projects
  // directory (see server/lib/project-paths.mjs) - not configurable in
  // this context, so use that real path rather than an unrelated temp dir.
  const projectDir = "/projects/mkdd-live-proxy-e2e-test";
  fs.mkdirSync(projectDir, { recursive: true });

  // A server that streams its response in chunks (Transfer-Encoding:
  // chunked, no known Content-Length up front) - exactly how real SSR
  // frameworks like Next.js normally respond. This is the case that
  // broke live previews with "Parse Error: Content-Length can't be
  // present with Transfer-Encoding" until this was fixed.
  const fakeApp = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.write('<link href="/_next/static/x.css"/>');
    res.end("<p>done</p>");
  });

  await new Promise((resolve) => fakeApp.listen(0, "127.0.0.1", resolve));
  const fakeAppPort = fakeApp.address().port;

  process.env.OPENHANDS_URL = "http://127.0.0.1:9999";
  process.env.MKDD_LIVE_APP_PORT = String(fakeAppPort);

  // Re-import with the env vars set, using a fresh module registry entry
  // (query string busts Node's module cache) so agentCanvasHost()/
  // LIVE_APP_PORT pick up these test-specific values.
  const { handleLiveProxy } = await import(`./live-proxy.mjs?t=${Date.now()}`);

  const mkddServer = http.createServer(async (req, res) => {
    const handled = await handleLiveProxy(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => mkddServer.listen(0, "127.0.0.1", resolve));
  const mkddPort = mkddServer.address().port;

  const response = await fetch(
    `http://127.0.0.1:${mkddPort}/live/mkdd-live-proxy-e2e-test/page`,
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  // The actual bug: both headers present together is an HTTP protocol
  // violation that made real proxies (Vite's included) reject the
  // response outright.
  assert.equal(response.headers.get("transfer-encoding"), null);
  assert.ok(response.headers.get("content-length"));
  assert.equal(Number(response.headers.get("content-length")), Buffer.byteLength(body));
  assert.ok(body.includes('href="/live/mkdd-live-proxy-e2e-test/_next/static/x.css"'));

  fakeApp.close();
  mkddServer.close();
  fs.rmSync(projectDir, { recursive: true, force: true });
});
