import { useEffect, useMemo, useState } from "react";
import { fetchConversation, fetchEvents } from "../api/client";
import type {
  AgentProfile,
  ConversationCost,
  ConversationExecutionStatus,
  WorkPlan,
  Workspace,
} from "../types";

export type ProjectEmployeeStatus = {
  employeeId: string;
  conversationId: string | null;
  executionStatus: ConversationExecutionStatus | null;
  cost: ConversationCost | null;
  workPlan: WorkPlan | null;
};

type Params = {
  project: Workspace | null;
  employees: AgentProfile[];
};

// BUGS_AND_FIXES.md #65: this hook polls /api/conversation for every
// employee every 5 seconds - it must stay on the cheap,
// short-circuiting per-employee lookup only. Project-level total cost
// (an expensive exhaustive scan) intentionally lives in a separate
// hook (useProjectTotalCost) on its own, much slower refresh schedule
// - bundling it into this hot path previously broke the UI entirely
// as conversation volume grew.
export function useProjectTeamStatus({ project, employees }: Params) {
  const [items, setItems] = useState<ProjectEmployeeStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;

    if (!project) {
      setItems([]);
      setLoading(false);
      return;
    }

    const load = async (initial = false) => {
      if (refreshing) return;
      refreshing = true;

      if (initial) {
        setLoading(true);
      }

      const updates = await Promise.all(
        employees.map(async (employee): Promise<ProjectEmployeeStatus | null> => {
          try {
            const conversationResponse = await fetchConversation(
              project.path,
              employee.id,
              employee.name,
            );

            const conversation = conversationResponse.conversation;

            if (!conversation) {
              return {
                employeeId: employee.id,
                conversationId: null,
                executionStatus: null,
                cost: null,
                workPlan: null,
              };
            }

            let workPlan: WorkPlan | null | undefined = undefined;

            try {
              const eventsResponse = await fetchEvents(
                conversation.id,
                project.path,
                employee.id,
                employee.name,
              );
              workPlan = eventsResponse.work_plan;
            } catch {
              // Preserve the previous work plan on a transient events failure.
            }

            return {
              employeeId: employee.id,
              conversationId: conversation.id,
              executionStatus: conversation.execution_status ?? null,
              cost: conversation.cost ?? null,
              workPlan: workPlan ?? null,
            };
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) {
        setItems((current) => {
          const previous = new Map(current.map((item) => [item.employeeId, item]));

          for (const update of updates) {
            if (!update) continue;

            const old = previous.get(update.employeeId);

            previous.set(update.employeeId, {
              ...update,
              workPlan: update.workPlan ?? old?.workPlan ?? null,
              cost: update.cost ?? old?.cost ?? null,
              executionStatus: update.executionStatus ?? old?.executionStatus ?? null,
              conversationId: update.conversationId ?? old?.conversationId ?? null,
            });
          }

          return employees.map(
            (employee) =>
              previous.get(employee.id) ?? {
                employeeId: employee.id,
                conversationId: null,
                executionStatus: null,
                cost: null,
                workPlan: null,
              },
          );
        });
      }

      refreshing = false;

      if (!cancelled && initial) {
        setLoading(false);
      }
    };

    void load(true);
    const interval = window.setInterval(() => void load(false), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [project?.path, employees]);

  const byEmployeeId = useMemo(
    () => new Map(items.map((item) => [item.employeeId, item])),
    [items],
  );

  return {
    items,
    byEmployeeId,
    loading,
  };
}
