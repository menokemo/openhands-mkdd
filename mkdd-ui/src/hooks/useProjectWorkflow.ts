import { useEffect, useState } from "react";
import {
  fetchWorkflow,
  type WorkflowState,
} from "../api/client";
import type { Workspace } from "../types";

type Options = {
  project: Workspace | null;
};

export function useProjectWorkflow({ project }: Options) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;

    if (!project) {
      setWorkflow(null);
      setLoading(false);
      return;
    }

    const load = async (initial = false) => {
      if (refreshing) return;
      refreshing = true;

      if (initial) {
        setLoading(true);
      }

      try {
        const next = await fetchWorkflow(project.path);
        if (!cancelled) {
          setWorkflow(next);
        }
      } catch {
        // Keep the last known-good workflow visible.
      } finally {
        refreshing = false;
        if (!cancelled && initial) {
          setLoading(false);
        }
      }
    };

    void load(true);
    const timer = window.setInterval(() => void load(false), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [project?.path]);

  return {
    workflow,
    loading,
    setWorkflow,
  };
}
