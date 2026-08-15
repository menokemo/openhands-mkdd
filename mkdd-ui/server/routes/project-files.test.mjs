import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { walk } from "./project-files.mjs";

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-project-files-"));
  fs.mkdirSync(path.join(dir, "docs", "design"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "hello");
  fs.writeFileSync(path.join(dir, "docs", "design", "palette.html"), "colors");
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, ".git", "config"), "should be ignored");
  fs.mkdirSync(path.join(dir, "node_modules", "somepkg"), { recursive: true });
  fs.writeFileSync(path.join(dir, "node_modules", "somepkg", "index.js"), "ignored");
  return dir;
}

test("lists real files and directories with correct types and sizes", () => {
  const dir = makeTempProject();
  const files = walk(dir, "");

  const indexEntry = files.find((f) => f.path === "index.html");
  assert.equal(indexEntry.type, "file");
  assert.equal(indexEntry.size, "hello".length);

  const docsEntry = files.find((f) => f.path === "docs");
  assert.equal(docsEntry.type, "directory");

  const nestedEntry = files.find((f) => f.path === "docs/design/palette.html");
  assert.equal(nestedEntry.type, "file");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("excludes .git and node_modules entirely", () => {
  const dir = makeTempProject();
  const files = walk(dir, "");

  assert.ok(!files.some((f) => f.path.includes(".git")));
  assert.ok(!files.some((f) => f.path.includes("node_modules")));

  fs.rmSync(dir, { recursive: true, force: true });
});

test("returns an empty list for an empty directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-project-files-empty-"));
  assert.deepEqual(walk(dir, ""), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
