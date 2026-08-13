/**
 * Derives Work Plan data from real task_tracker observation events.
 * Must never be fabricated (README section 17 / 47): if there is no
 * task_tracker activity yet, this returns null rather than inventing
 * a progress value.
 *
 * @param {Array} normalizedEvents - events already passed through normalizeEvent()
 */
export function deriveWorkPlan(normalizedEvents) {
  const latestTracker =
    [...normalizedEvents]
      .reverse()
      .find(
        (event) =>
          event.kind === "ObservationEvent" &&
          event.tool_name === "task_tracker" &&
          event.task_tracker,
      )?.task_tracker ?? null;

  const tasks = latestTracker?.task_list ?? [];

  if (tasks.length === 0) {
    return null;
  }

  const counts = {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === "todo").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    done: tasks.filter((task) => task.status === "done").length,
  };

  return {
    tasks,
    counts,
    progressPercent: Math.round((counts.done / counts.total) * 100),
  };
}
