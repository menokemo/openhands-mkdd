import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveWorkPlan } from "./work-plan.mjs";

test("returns null (not a fabricated plan) when there is no task_tracker activity", () => {
  assert.equal(deriveWorkPlan([]), null);
});

test("computes counts and progress from the latest task_tracker observation", () => {
  const events = [
    {
      kind: "ObservationEvent",
      tool_name: "task_tracker",
      task_tracker: {
        task_list: [
          { title: "a", status: "done" },
          { title: "b", status: "todo" },
          { title: "c", status: "in_progress" },
          { title: "d", status: "done" },
        ],
      },
    },
  ];
  const plan = deriveWorkPlan(events);
  assert.equal(plan.counts.total, 4);
  assert.equal(plan.counts.done, 2);
  assert.equal(plan.counts.todo, 1);
  assert.equal(plan.counts.inProgress, 1);
  assert.equal(plan.progressPercent, 50);
});

test("uses the most recent task_tracker snapshot when several exist", () => {
  const events = [
    {
      kind: "ObservationEvent",
      tool_name: "task_tracker",
      task_tracker: { task_list: [{ title: "old", status: "todo" }] },
    },
    {
      kind: "ObservationEvent",
      tool_name: "task_tracker",
      task_tracker: { task_list: [{ title: "new", status: "done" }] },
    },
  ];
  const plan = deriveWorkPlan(events);
  assert.equal(plan.tasks[0].title, "new");
  assert.equal(plan.progressPercent, 100);
});
