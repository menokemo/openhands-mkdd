import { useCallback, useEffect, useState } from "react";
import { fetchProjectTotalCost } from "../api/client";
import type { Workspace } from "../types";

// Refreshed far less often than useProjectTeamStatus's 5s poll - this
// is an expensive exhaustive scan (BUGS_AND_FIXES.md #65), and the
// total cost doesn't need second-by-second freshness the way execution
// status does.
const REFRESH_INTERVAL_MS = 30000;

export function useProjectTotalCost(project: Workspace | null) {
  const [totalCost, setTotalCost] = useState(0);
  // BUGS_AND_FIXES.md #216: the owner's own optional per-project
  // budget, returned alongside the real cost from the same endpoint.
  const [budget, setBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const projectSlug = project?.path.split("/").filter(Boolean).pop() ?? "";

  const load = useCallback(
    async (initial = false) => {
      if (!projectSlug) return;
      if (initial) setLoading(true);
      try {
        const result = await fetchProjectTotalCost(projectSlug);
        setTotalCost(result.totalCost);
        setBudget(result.budget);
      } catch {
        // Preserve the last known-good total on a transient failure.
      } finally {
        if (initial) setLoading(false);
      }
    },
    [projectSlug],
  );

  useEffect(() => {
    if (!project) {
      setTotalCost(0);
      setBudget(null);
      setLoading(false);
      return;
    }

    void load(true);
    const interval = window.setInterval(() => void load(false), REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [project, load]);

  return { totalCost, budget, loading, refresh: () => load(false) };
}
