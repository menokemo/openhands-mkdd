import { test } from "node:test";
import assert from "node:assert/strict";
import { validateImageDataUrls, buildOutgoingContent } from "./chat.mjs";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("validateImageDataUrls: null (no error) when no images given", () => {
  assert.equal(validateImageDataUrls(undefined), null);
  assert.equal(validateImageDataUrls([]), null);
});

test("validateImageDataUrls: accepts a valid small image", () => {
  assert.equal(validateImageDataUrls([TINY_PNG]), null);
});

test("validateImageDataUrls: rejects more than the max count", () => {
  const five = Array(5).fill(TINY_PNG);
  assert.equal(validateImageDataUrls(five), "too_many_images");
});

test("validateImageDataUrls: rejects a non-data-url string", () => {
  assert.equal(validateImageDataUrls(["not-a-real-image"]), "invalid_image_data_url");
});

test("validateImageDataUrls: rejects an unsupported mime type", () => {
  const svg = "data:image/svg+xml;base64,AAAA";
  assert.equal(validateImageDataUrls([svg]), "invalid_image_data_url");
});

test("validateImageDataUrls: rejects an oversized image", () => {
  // ~7MB of base64 payload, above the 5MB limit.
  const hugeBase64 = "A".repeat(7 * 1024 * 1024);
  const huge = `data:image/png;base64,${hugeBase64}`;
  assert.equal(validateImageDataUrls([huge]), "image_too_large");
});

test("buildOutgoingContent: text-only message", () => {
  const content = buildOutgoingContent("hello", undefined);
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "text");
  assert.ok(content[0].text.endsWith("hello"));
});

test("buildOutgoingContent: image-only message still includes a (possibly empty) text block for time-context", () => {
  const content = buildOutgoingContent("", [TINY_PNG]);
  assert.equal(content.length, 2);
  assert.equal(content[0].type, "text");
  assert.equal(content[1].type, "image");
  assert.deepEqual(content[1].image_urls, [TINY_PNG]);
});

test("buildOutgoingContent: text + images together", () => {
  const content = buildOutgoingContent("check this out", [TINY_PNG, TINY_PNG]);
  assert.equal(content.length, 2);
  assert.ok(content[0].text.endsWith("check this out"));
  assert.equal(content[1].image_urls.length, 2);
});
