import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLiveProxyPath } from "./live-proxy.mjs";

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
