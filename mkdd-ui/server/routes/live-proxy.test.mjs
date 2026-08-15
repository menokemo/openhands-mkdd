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
