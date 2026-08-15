import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolvePreviewFile } from "./preview.mjs";

const PROJECTS_DIR = "/projects";

test("resolves a simple file inside the project directory", () => {
  const result = resolvePreviewFile("my-site/index.html", PROJECTS_DIR);
  assert.equal(result, path.join(PROJECTS_DIR, "my-site/index.html"));
});

test("resolves a nested file path", () => {
  const result = resolvePreviewFile("my-site/docs/design/palette.html", PROJECTS_DIR);
  assert.equal(result, path.join(PROJECTS_DIR, "my-site/docs/design/palette.html"));
});

test("defaults to index.html for a bare project request", () => {
  const result = resolvePreviewFile("my-site", PROJECTS_DIR);
  assert.equal(result, path.join(PROJECTS_DIR, "my-site/index.html"));
});

test("defaults to index.html for a directory-style trailing slash", () => {
  const result = resolvePreviewFile("my-site/docs/", PROJECTS_DIR);
  assert.equal(result, path.join(PROJECTS_DIR, "my-site/docs/index.html"));
});

test("returns null when no project slug is present", () => {
  assert.equal(resolvePreviewFile("", PROJECTS_DIR), null);
});

test("blocks literal path traversal (already collapsed by callers in practice, but must hold on its own)", () => {
  const result = resolvePreviewFile("my-site/../../etc/passwd", PROJECTS_DIR);
  assert.equal(result, null);
});

test("blocks the real risky case: decoded traversal that bypasses URL-level normalization", () => {
  // Confirmed live (BUGS_AND_FIXES.md #41): the WHATWG URL parser
  // normalizes literal ".." in a path automatically, but a caller who
  // percent-decodes the pathname AFTER parsing (as this route must, to
  // support real filenames with spaces/unicode) can reintroduce ".."
  // sequences the URL parser never saw. This is the actual attack this
  // function exists to stop.
  const result = resolvePreviewFile("my-site/../../tmp/secret.txt", PROJECTS_DIR);
  assert.equal(result, null);
});

test("blocks a project slug that is itself a traversal attempt", () => {
  const result = resolvePreviewFile("../etc/index.html", PROJECTS_DIR);
  assert.equal(result, null);
});

test("does not false-positive on a legitimate project whose name starts like another project's name", () => {
  // Guards against a naive startsWith(projectDir) check (without the
  // trailing separator) that would wrongly treat /projects/my-site-2 as
  // "inside" /projects/my-site.
  const result = resolvePreviewFile("my-site-2/index.html", PROJECTS_DIR);
  assert.equal(result, path.join(PROJECTS_DIR, "my-site-2/index.html"));
});
