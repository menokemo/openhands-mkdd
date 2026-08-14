import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withTimeContext,
  stripTimeContext,
  buildTimeContextInstructions,
} from "./time-context.mjs";

test("buildTimeContextInstructions embeds the given timezone", () => {
  const text = buildTimeContextInstructions("Europe/Amsterdam");
  assert.ok(text.includes("Europe/Amsterdam"));
  assert.ok(text.includes("<!--mkdd:time:"));
});

test("buildTimeContextInstructions reflects a different timezone when given one", () => {
  const text = buildTimeContextInstructions("Africa/Cairo");
  assert.ok(text.includes("Africa/Cairo"));
  assert.ok(!text.includes("Europe/Amsterdam"));
});

test("withTimeContext prepends a marker line with a valid ISO timestamp", () => {
  const result = withTimeContext("hello");
  const match = result.match(/^<!--mkdd:time:([^>]*)-->\n(.*)$/s);
  assert.ok(match, "expected the marker format to match");
  const [, timestamp, rest] = match;
  assert.equal(rest, "hello");
  assert.ok(!Number.isNaN(Date.parse(timestamp)), "timestamp should be parseable");
});

test("stripTimeContext removes exactly the marker line, nothing else", () => {
  const withMarker = withTimeContext("multi\nline\nmessage");
  assert.equal(stripTimeContext(withMarker), "multi\nline\nmessage");
});

test("stripTimeContext is a no-op on text without a marker", () => {
  assert.equal(stripTimeContext("plain text"), "plain text");
  assert.equal(stripTimeContext(""), "");
});

test("stripTimeContext does not strip a marker-like string that isn't at the start", () => {
  const text = "hello <!--mkdd:time:2026-01-01T00:00:00.000Z--> world";
  assert.equal(stripTimeContext(text), text);
});

test("round-trip: withTimeContext then stripTimeContext returns the exact original text", () => {
  const originals = ["short", "with\nnewlines\nhere", "unicode: مرحبا", ""];
  for (const original of originals) {
    assert.equal(stripTimeContext(withTimeContext(original)), original);
  }
});
