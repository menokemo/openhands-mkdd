import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesEmployee,
  findAllProjectConversations,
} from "./authorize-conversation.mjs";

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

// BUGS_AND_FIXES.md #145: findAllProjectConversations is now a pure
// local filter over an already-fetched list, not a network call of
// its own - the critical fix that eliminated re-scanning every
// conversation on the server once per project.

test("findAllProjectConversations filters to only the requested project", () => {
  const allConversations = [
    { id: "c1", tags: { mkddproject: "/projects/acme" } },
    { id: "c2", tags: { mkddproject: "/projects/other" } },
    { id: "c3", tags: { mkddproject: "/projects/acme" } },
  ];

  const result = findAllProjectConversations("/projects/acme", allConversations);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((c) => c.id),
    ["c1", "c3"],
  );
});

test("findAllProjectConversations returns an empty array when no conversations match", () => {
  const allConversations = [{ id: "c1", tags: { mkddproject: "/projects/other" } }];

  assert.deepEqual(findAllProjectConversations("/projects/acme", allConversations), []);
});

test("findAllProjectConversations safely handles conversations with no tags", () => {
  const allConversations = [
    { id: "c1" },
    { id: "c2", tags: { mkddproject: "/projects/acme" } },
  ];

  const result = findAllProjectConversations("/projects/acme", allConversations);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "c2");
});

test("findAllProjectConversations called repeatedly for different projects against the SAME pre-fetched list produces correct, independent results (the whole point of #145's fix - one fetch, many cheap local filters)", () => {
  const allConversations = [
    { id: "c1", tags: { mkddproject: "/projects/a" } },
    { id: "c2", tags: { mkddproject: "/projects/b" } },
    { id: "c3", tags: { mkddproject: "/projects/a" } },
    { id: "c4", tags: { mkddproject: "/projects/c" } },
  ];

  const resultA = findAllProjectConversations("/projects/a", allConversations);
  const resultB = findAllProjectConversations("/projects/b", allConversations);
  const resultC = findAllProjectConversations("/projects/c", allConversations);

  assert.deepEqual(
    resultA.map((c) => c.id),
    ["c1", "c3"],
  );
  assert.deepEqual(
    resultB.map((c) => c.id),
    ["c2"],
  );
  assert.deepEqual(
    resultC.map((c) => c.id),
    ["c4"],
  );
});
