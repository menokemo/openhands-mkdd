import { test } from "node:test";
import assert from "node:assert/strict";
import { textContent, normalizeEvent } from "./normalize-event.mjs";

test("textContent: accepts the standard array-of-TextContent shape", () => {
  const result = textContent([{ type: "text", text: "hello" }]);
  assert.deepEqual(result, [{ type: "text", text: "hello" }]);
});

test("textContent: accepts a raw string (BUGS_AND_FIXES.md #3 fix)", () => {
  const result = textContent("hello");
  assert.deepEqual(result, [{ type: "text", text: "hello" }]);
});

test("textContent: an empty string normalizes to an empty array, not [{text:''}]", () => {
  assert.deepEqual(textContent(""), []);
});

test("textContent: filters out non-text array items", () => {
  const result = textContent([
    { type: "text", text: "keep me" },
    { type: "image", url: "http://example.com/x.png" },
  ]);
  assert.deepEqual(result, [{ type: "text", text: "keep me" }]);
});

test("textContent: null/undefined/other types normalize to an empty array", () => {
  assert.deepEqual(textContent(null), []);
  assert.deepEqual(textContent(undefined), []);
  assert.deepEqual(textContent(42), []);
});

test("normalizeEvent: strips the time-context marker from user messages", () => {
  const event = {
    id: "1",
    kind: "MessageEvent",
    source: "user",
    llm_message: {
      content: [
        { type: "text", text: "<!--mkdd:time:2026-08-14T10:00:00.000Z-->\nhello there" },
      ],
    },
  };
  const result = normalizeEvent(event);
  assert.equal(result.llm_message.content[0].text, "hello there");
});

test("normalizeEvent: leaves agent messages untouched (no marker to strip)", () => {
  const event = {
    id: "1",
    kind: "MessageEvent",
    source: "agent",
    llm_message: {
      content: [
        { type: "text", text: "<!--mkdd:time:2026-08-14T10:00:00.000Z-->\nhello there" },
      ],
    },
  };
  const result = normalizeEvent(event);
  // Agent messages never carry the marker in practice; this only proves
  // stripping is scoped to source === "user" and doesn't accidentally
  // mangle unrelated agent text that happens to look similar.
  assert.equal(
    result.llm_message.content[0].text,
    "<!--mkdd:time:2026-08-14T10:00:00.000Z-->\nhello there",
  );
});

test("normalizeEvent: MessageEvent normalizes string content via the shared fix", () => {
  const event = {
    id: "1",
    kind: "MessageEvent",
    source: "agent",
    timestamp: "2026-08-13T00:00:00Z",
    llm_message: { content: "plain string content" },
  };
  const result = normalizeEvent(event);
  assert.deepEqual(result.llm_message.content, [
    { type: "text", text: "plain string content" },
  ]);
});

test("normalizeEvent: unknown event kinds return null (never leak unsafe data)", () => {
  assert.equal(normalizeEvent({ id: "1", kind: "SomeInternalDebugEvent" }), null);
});

test("normalizeEvent: ObservationEvent extracts a valid task_tracker payload", () => {
  const event = {
    id: "1",
    kind: "ObservationEvent",
    source: "agent",
    tool_name: "task_tracker",
    observation: {
      command: "view",
      task_list: [
        { title: "Do the thing", status: "todo", notes: "" },
        { title: "invalid status - dropped", status: "bogus" },
      ],
    },
  };
  const result = normalizeEvent(event);
  assert.equal(result.task_tracker.task_list.length, 1);
  assert.equal(result.task_tracker.task_list[0].title, "Do the thing");
});
