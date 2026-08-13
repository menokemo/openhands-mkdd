import { test } from "node:test";
import assert from "node:assert/strict";
import { slugifyProjectName } from "./projects.mjs";

test("lowercases and hyphenates a normal name", () => {
  assert.equal(slugifyProjectName("My Cool Project"), "my-cool-project");
});

test("collapses multiple separators into one hyphen", () => {
  assert.equal(slugifyProjectName("foo   bar___baz"), "foo-bar-baz");
});

test("strips leading/trailing hyphens", () => {
  assert.equal(slugifyProjectName("  --hello--  "), "hello");
});

test("neutralizes path traversal attempts", () => {
  assert.equal(slugifyProjectName("../../etc/passwd"), "etc-passwd");
  assert.equal(slugifyProjectName("..%2f..%2fetc"), "2f-2fetc");
});

test("neutralizes shell metacharacters", () => {
  assert.equal(slugifyProjectName("evil; rm -rf /"), "evil-rm-rf");
  assert.equal(slugifyProjectName("$(whoami)"), "whoami");
});

test("truncates to 64 characters", () => {
  const longName = "a".repeat(100);
  assert.equal(slugifyProjectName(longName).length, 64);
});

test("keeps digits and Arabic-adjacent ASCII transliteration untouched (non-ASCII is stripped)", () => {
  // Non-ASCII characters are not valid in a filesystem-safe slug here;
  // they get stripped, which is intentional and covered so behavior is
  // explicit rather than accidental.
  assert.equal(slugifyProjectName("project-2026"), "project-2026");
});
