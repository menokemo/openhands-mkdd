import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// live-port-registry.mjs reads MKDD_DATA_DIR at import time, so we set
// it BEFORE importing - isolated from the real /mkdd-data mount.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-live-port-"));
process.env.MKDD_DATA_DIR = tempDir;

const { getOrAssignLivePort, findProjectForLivePort, LIVE_PORT_RANGE_START } =
  await import("./live-port-registry.mjs");

test("assigns the first range port to a brand-new project", () => {
  const port = getOrAssignLivePort("first-ever-project");
  assert.equal(port, LIVE_PORT_RANGE_START);
});

test("re-requesting the same project's port returns the same value, not a new one", () => {
  const first = getOrAssignLivePort("stable-project");
  const second = getOrAssignLivePort("stable-project");
  assert.equal(first, second);
});

test("different projects get different ports", () => {
  const a = getOrAssignLivePort("project-a");
  const b = getOrAssignLivePort("project-b");
  assert.notEqual(a, b);
});

test("assigns sequential free ports, skipping already-taken ones", () => {
  getOrAssignLivePort("seq-1");
  getOrAssignLivePort("seq-2");
  const third = getOrAssignLivePort("seq-3");
  const usedByThird = [getOrAssignLivePort("seq-1"), getOrAssignLivePort("seq-2")];
  assert.ok(!usedByThird.includes(third));
});

test("throws a clear error once the entire range is exhausted", async () => {
  // Isolated from the shared registry above (which already has several
  // ports consumed by earlier tests) - a fresh registry guarantees all
  // LIVE_PORT_RANGE_SIZE slots are genuinely free before filling them.
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "mkdd-live-port-exhaust-"));
  process.env.MKDD_DATA_DIR = isolatedDir;
  const isolated = await import(`./live-port-registry.mjs?isolated=${Date.now()}`);

  for (let i = 0; i < isolated.LIVE_PORT_RANGE_SIZE; i++) {
    isolated.getOrAssignLivePort(`exhaust-${i}`);
  }
  assert.throws(
    () => isolated.getOrAssignLivePort("one-too-many"),
    /live_port_range_exhausted/,
  );

  process.env.MKDD_DATA_DIR = tempDir;
});

test("findProjectForLivePort finds the owning project", () => {
  const port = getOrAssignLivePort("findable-project");
  assert.equal(findProjectForLivePort(port), "findable-project");
});

test("findProjectForLivePort returns null for an unassigned port", () => {
  assert.equal(findProjectForLivePort(999999), null);
});
