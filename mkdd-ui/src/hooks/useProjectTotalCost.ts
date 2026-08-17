import { useEffect, useState } from "react";
import { fetchProjectTotalCost } from "../api/client";
import type { Workspace } from "../types";

// Refreshed far less often than useProjectTeamStatus's 5s poll - this
// is an expensive exhaustive scan (BUGS_AND_FIXES.md #65), and the
// total cost doesn't need second-by-second freshness the way execution
// status does.
const REFRESH_INTERVAL_MS = 30000;

export function useProjectTotalCost(project: Workspace | null) {
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!project) {
      setTotalCost(0);
      setLoading(false);
      return;
    }

    const projectSlug = project.path.split("/").filter(Boolean).pop() ?? "";

    const load = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const cost = await fetchProjectTotalCost(projectSlug);
        if (!cancelled) setTotalCost(cost);
      } catch {
        // Preserve the last known-good total on a transient failure.
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    void load(true);
    const interval = window.setInterval(() => void load(false), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [project?.path]);

  return { totalCost, loading };
}
