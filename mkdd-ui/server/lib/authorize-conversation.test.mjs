import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesEmployee } from "./authorize-conversation.mjs";

const ctx = { project: "proj-1", employeeId: "emp-1", employeeName: "Fady" };

test("rejects a conversation from a different project", () => {
  const conversation = {
    tags: { mkddproject: "other-project", mkddemployeeid: "emp-1" },
  };
  assert.equal(matchesEmployee(conversation, ctx), false);
});

test("matches by stable employeeId when the tag is present", () => {
  const conversation = {
    tags: { mkddproject: "proj-1", mkddemployeeid: "emp-1" },
  };
  assert.equal(matchesEmployee(conversation, ctx), true);
});

test("rejects a mismatched employeeId even if the legacy name happens to match", () => {
  const conversation = {
    tags: {
      mkddproject: "proj-1",
      mkddemployeeid: "some-other-employee",
      mkddemployee: "Fady",
    },
  };
  assert.equal(matchesEmployee(conversation, ctx), false);
});

test("falls back to employee name only for legacy conversations without mkddemployeeid", () => {
  const conversation = {
    tags: { mkddproject: "proj-1", mkddemployee: "Fady" },
  };
  assert.equal(matchesEmployee(conversation, ctx), true);
});

test("legacy fallback still rejects a non-matching name", () => {
  const conversation = {
    tags: { mkddproject: "proj-1", mkddemployee: "Someone Else" },
  };
  assert.equal(matchesEmployee(conversation, ctx), false);
});

test("rejects a conversation with no tags at all", () => {
  assert.equal(matchesEmployee({}, ctx), false);
});
