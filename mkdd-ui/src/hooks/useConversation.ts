import { useEffect, useState } from "react";
import type {
  ActivityEvent,
  AgentProfile,
  ChatMessage,
  ConversationEvent,
  ConversationExecutionStatus,
  ConversationEventBase,
  ConversationCost,
  Workspace,
  WorkPlan,
} from "../types";
import { fetchConversation, fetchEvents, sendChatMessage } from "../api/client";

type Params = {
  project: Workspace | null;
  employee: AgentProfile | null;
};

const TERMINAL_STATUSES = new Set<ConversationExecutionStatus>([
  "finished",
  "error",
  "stuck",
]);

function splitEvents(events: ConversationEvent[]) {
  const messages = events.filter(
    (event): event is ChatMessage => event.kind === "MessageEvent",
  );

  const activity = events.filter(
    (event): event is ActivityEvent => event.kind !== "MessageEvent",
  );

  return { messages, activity };
}

function mergeById<T extends ConversationEventBase>(current: T[], incoming: T[]): T[] {
  const merged = new Map<string, T>();

  for (const item of current) merged.set(item.id, item);
  for (const item of incoming) merged.set(item.id, item);

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
    return aTime - bTime;
  });
}

export function useConversation({ project, employee }: Params) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [workPlan, setWorkPlan] = useState<WorkPlan | null>(null);
  const [cost, setCost] = useState<ConversationCost | null>(null);
  const [executionStatus, setExecutionStatus] =
    useState<ConversationExecutionStatus | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!project || !employee) {
      setMessages([]);
      setActivity([]);
      setWorkPlan(null);
      setCost(null);
      setExecutionStatus(null);
      return;
    }

    let cancelled = false;

    setMessages([]);
    setActivity([]);
    setWorkPlan(null);
    setCost(null);
    setExecutionStatus(null);

    fetchConversation(project.path, employee.id, employee.name)
      .then(async (data) => {
        const conversation = data.conversation;

        if (!conversation) {
          if (!cancelled) {
            setMessages([]);
            setActivity([]);
            setWorkPlan(null);
            setCost(null);
            setExecutionStatus(null);
          }
          return;
        }

        const response = await fetchEvents(
          conversation.id,
          project.path,
          employee.id,
          employee.name,
        );
        if (cancelled) return;

        const split = splitEvents(response.items ?? []);
        setMessages((current) => mergeById(current, split.messages));
        setActivity((current) => mergeById(current, split.activity));
        setWorkPlan(response.work_plan);
        setCost(conversation.cost ?? null);
        setExecutionStatus(conversation.execution_status ?? null);
      })
      .catch(() => {
        // Keep the last known-good conversation state visible.
      });

    return () => {
      cancelled = true;
    };
  }, [project, employee]);

  useEffect(() => {
    setMessage("");
  }, [project, employee]);

  useEffect(() => {
    if (!project || !employee) return;

    let cancelled = false;
    let refreshing = false;

    const refreshConversation = async () => {
      if (refreshing) return;
      refreshing = true;

      try {
        const conversationData = await fetchConversation(
          project.path,
          employee.id,
          employee.name,
        );

        const conversation = conversationData.conversation;
        if (!conversation || cancelled) return;

        const eventsData = await fetchEvents(
          conversation.id,
          project.path,
          employee.id,
          employee.name,
        );

        if (cancelled) return;

        const split = splitEvents(eventsData.items ?? []);

        setMessages((current) => mergeById(current, split.messages));
        setActivity((current) => mergeById(current, split.activity));
        setWorkPlan(eventsData.work_plan);
        setCost(conversation.cost ?? null);
        setExecutionStatus(conversation.execution_status ?? null);
      } catch {
        // Keep the last confirmed UI state on transient sync failures.
      } finally {
        refreshing = false;
      }
    };

    void refreshConversation();
    const timer = window.setInterval(refreshConversation, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [project, employee]);

  async function sendMessage() {
    if (!project || !employee || !message.trim() || sending) return;

    setSending(true);

    try {
      const sendData = await sendChatMessage(
        project.path,
        employee.id,
        employee.name,
        message.trim(),
      );

      const id = sendData.conversation?.id ?? sendData.conversation_id;
      setMessage("");

      if (!id) return;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const [conversationData, eventsData] = await Promise.all([
          fetchConversation(project.path, employee.id, employee.name),
          fetchEvents(id, project.path, employee.id, employee.name),
        ]);

        const split = splitEvents(eventsData.items ?? []);
        setMessages((current) => mergeById(current, split.messages));
        setActivity((current) => mergeById(current, split.activity));
        setWorkPlan(eventsData.work_plan);
        setCost(conversationData.conversation?.cost ?? null);
        const status = conversationData.conversation?.execution_status ?? null;

        setExecutionStatus(status);

        if (status && TERMINAL_STATUSES.has(status)) {
          break;
        }
      }
    } finally {
      setSending(false);
    }
  }

  return {
    messages,
    activity,
    workPlan,
    cost,
    executionStatus,
    message,
    sending,
    setMessage,
    sendMessage,
  };
}
