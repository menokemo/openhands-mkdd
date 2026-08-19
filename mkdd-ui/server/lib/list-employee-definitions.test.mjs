import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listEmployeeNames } from "./list-employee-definitions.mjs";

function makeTempDefinitionsDir(filenames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-defs-"));
  for (const name of filenames) {
    fs.writeFileSync(path.join(dir, name), "---\nname: x\n---\n");
  }
  return dir;
}

test("excludes company-orchestrator.md", () => {
  const dir = makeTempDefinitionsDir(["product-manager.md", "company-orchestrator.md"]);
  assert.deepEqual(listEmployeeNames(dir), ["product-manager"]);
});

test("excludes AGENTS.md (regression test for BUGS_AND_FIXES.md #19)", () => {
  const dir = makeTempDefinitionsDir(["product-manager.md", "AGENTS.md"]);
  assert.deepEqual(listEmployeeNames(dir), ["product-manager"]);
});

test("excludes both non-employee files at once", () => {
  const dir = makeTempDefinitionsDir([
    "product-manager.md",
    "business-analyst.md",
    "company-orchestrator.md",
    "AGENTS.md",
  ]);
  const names = listEmployeeNames(dir).sort();
  assert.deepEqual(names, ["business-analyst", "product-manager"]);
});

test("ignores non-.md files", () => {
  const dir = makeTempDefinitionsDir(["product-manager.md"]);
  fs.writeFileSync(path.join(dir, "README.txt"), "not an employee");
  assert.deepEqual(listEmployeeNames(dir), ["product-manager"]);
});

test("sorts by each file's own order field, not filesystem/alphabetical order (regression test for BUGS_AND_FIXES.md #116)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-defs-order-"));
  // "aaa-late-addition" sorts FIRST alphabetically/by readdir, but its
  // order field says it belongs LAST - exactly the real scenario where
  // a newly-added employee file (content-writer.md/Sherry) landed in
  // an arbitrary filesystem position instead of its intended spot.
  fs.writeFileSync(path.join(dir, "aaa-late-addition.md"), "---\norder: 3\n---\n");
  fs.writeFileSync(path.join(dir, "product-manager.md"), "---\norder: 1\n---\n");
  fs.writeFileSync(path.join(dir, "business-analyst.md"), "---\norder: 2\n---\n");

  assert.deepEqual(listEmployeeNames(dir), [
    "product-manager",
    "business-analyst",
    "aaa-late-addition",
  ]);
});
