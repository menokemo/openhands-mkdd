import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// project-metadata.mjs reads MKDD_DATA_DIR at import time, so we set it
// BEFORE importing - each test file gets its own fresh temp dir, isolated
// from any other test run or the real /mkdd-data mount.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-project-meta-"));
process.env.MKDD_DATA_DIR = tempDir;

const { getProjectColor, setProjectColor, DEFAULT_PROJECT_COLOR, ALLOWED_COLORS } =
  await import("./project-metadata.mjs");

test("returns the default color for a project that's never been set", () => {
  assert.equal(getProjectColor("/projects/never-touched"), DEFAULT_PROJECT_COLOR);
});

test("setProjectColor persists, and getProjectColor reads it back", () => {
  const color = ALLOWED_COLORS[2];
  setProjectColor("/projects/my-app", color);
  assert.equal(getProjectColor("/projects/my-app"), color);
});

test("rejects a color outside the allowed list", () => {
  assert.throws(() => setProjectColor("/projects/x", "#ffffff"), /invalid_project_color/);
});

test("colors for different projects don't clobber each other", () => {
  setProjectColor("/projects/a", ALLOWED_COLORS[0]);
  setProjectColor("/projects/b", ALLOWED_COLORS[1]);
  assert.equal(getProjectColor("/projects/a"), ALLOWED_COLORS[0]);
  assert.equal(getProjectColor("/projects/b"), ALLOWED_COLORS[1]);
});

test("re-setting a project's color overwrites the previous value", () => {
  setProjectColor("/projects/c", ALLOWED_COLORS[0]);
  setProjectColor("/projects/c", ALLOWED_COLORS[3]);
  assert.equal(getProjectColor("/projects/c"), ALLOWED_COLORS[3]);
});
