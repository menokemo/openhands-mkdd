import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveUploadTarget } from "./project-upload.mjs";

const PROJECTS_DIR = "/projects";

function makeTempProject(slug) {
  fs.mkdirSync(path.join(PROJECTS_DIR, slug), { recursive: true });
}

test("resolves a normal filename into {project}/uploads/{filename}", () => {
  makeTempProject("test-upload-normal");
  const target = resolveUploadTarget("test-upload-normal", "glasses-1.jpg");
  assert.equal(target.targetPath, "/projects/test-upload-normal/uploads/glasses-1.jpg");
  fs.rmSync("/projects/test-upload-normal", { recursive: true, force: true });
});

test("rejects a filename containing a path separator (traversal attempt)", () => {
  makeTempProject("test-upload-traversal");
  assert.equal(resolveUploadTarget("test-upload-traversal", "../../etc/passwd"), null);
  assert.equal(resolveUploadTarget("test-upload-traversal", "a/b.jpg"), null);
  assert.equal(resolveUploadTarget("test-upload-traversal", "a\\b.jpg"), null);
  fs.rmSync("/projects/test-upload-traversal", { recursive: true, force: true });
});

test("rejects bare '.' and '..' as filenames", () => {
  makeTempProject("test-upload-dots");
  assert.equal(resolveUploadTarget("test-upload-dots", "."), null);
  assert.equal(resolveUploadTarget("test-upload-dots", ".."), null);
  fs.rmSync("/projects/test-upload-dots", { recursive: true, force: true });
});

test("rejects an empty or missing filename", () => {
  makeTempProject("test-upload-empty");
  assert.equal(resolveUploadTarget("test-upload-empty", ""), null);
  assert.equal(resolveUploadTarget("test-upload-empty", undefined), null);
  fs.rmSync("/projects/test-upload-empty", { recursive: true, force: true });
});

test("rejects a project slug that is itself a traversal attempt", () => {
  assert.equal(resolveUploadTarget("..", "file.jpg"), null);
});
