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
  // Real sum across every conversation ever created for this
  // employee on this project - see BUGS_AND_FIXES.md #63.
  totalCost: number;
  workPlan: WorkPlan | null;
};

type Params = {
  project: Workspace | null;
  employees: AgentProfile[];
};

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
                totalCost: conversationResponse.totalCost ?? 0,
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
              totalCost: conversationResponse.totalCost ?? 0,
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
              totalCost: update.totalCost ?? old?.totalCost ?? 0,
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
                totalCost: 0,
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

  // BUGS_AND_FIXES.md #63: sums totalCost (every conversation ever
  // created per employee, including ones superseded by "start new
  // conversation"), not cost.accumulatedCost (which only reflects the
  // currently-active conversation and would silently drop real money
  // spent on an old, no-longer-active conversation).
  const totalProjectCost = useMemo(
    () => items.reduce((sum, item) => sum + item.totalCost, 0),
    [items],
  );

  return {
    items,
    byEmployeeId,
    totalProjectCost,
    loading,
  };
}
