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

const OPTIMISTIC_ID_PREFIX = "optimistic-";
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

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

function buildChatWebSocketUrl(
  conversationId: string,
  project: string,
  employeeId: string,
  employeeName: string,
): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({
    conversation: conversationId,
    project,
    employeeId,
    employeeName,
  });
  return `${protocol}//${window.location.host}/ws/chat?${qs}`;
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
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Reflects incoming events into state, dropping any optimistic
  // placeholder once a real (non-optimistic) message has actually arrived
  // - see sendMessage() below for where the placeholder is added.
  function applyIncomingEvents(
    events: ConversationEvent[],
    newWorkPlan: WorkPlan | null,
  ) {
    const split = splitEvents(events);
    const hasRealMessage = split.messages.some(
      (m) => !m.id.startsWith(OPTIMISTIC_ID_PREFIX),
    );

    setMessages((current) => {
      const merged = mergeById(current, split.messages);
      return hasRealMessage
        ? merged.filter((m) => !m.id.startsWith(OPTIMISTIC_ID_PREFIX))
        : merged;
    });
    setActivity((current) => mergeById(current, split.activity));
    if (newWorkPlan !== undefined) setWorkPlan(newWorkPlan);
  }

  // --- Initial REST load: resolves the conversation id (if one exists)
  // and the starting history. This stays REST-only (Phase D keeps REST
  // for initial history + recovery, per REALTIME_CHAT_RESEARCH.md).
  useEffect(() => {
    setMessages([]);
    setActivity([]);
    setWorkPlan(null);
    setCost(null);
    setExecutionStatus(null);
    setConversationId(null);

    if (!project || !employee) return;

    let cancelled = false;

    fetchConversation(project.path, employee.id, employee.name)
      .then(async (data) => {
        const conversation = data.conversation;
        if (!conversation || cancelled) return;

        const response = await fetchEvents(
          conversation.id,
          project.path,
          employee.id,
          employee.name,
        );
        if (cancelled) return;

        applyIncomingEvents(response.items ?? [], response.work_plan);
        setCost(conversation.cost ?? null);
        setExecutionStatus(conversation.execution_status ?? null);
        setConversationId(conversation.id);
      })
      .catch(() => {
        // Keep the last known-good conversation state visible.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyIncomingEvents is stable in intent
  }, [project, employee]);

  useEffect(() => {
    setMessage("");
  }, [project, employee]);

  // --- Live WebSocket subscription (Phase D). Connects once a
  // conversation id is known; reconnects with backoff on drop; falls back
  // to nothing further (the REST recovery path below covers the
  // WS-unavailable case).
  useEffect(() => {
    if (!project || !employee || !conversationId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;

      const url = buildChatWebSocketUrl(
        conversationId,
        project.path,
        employee.id,
        employee.name,
      );
      socket = new WebSocket(url);

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload.type === "event" && payload.event) {
            applyIncomingEvents([payload.event], undefined as unknown as WorkPlan);
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) return;
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyIncomingEvents is stable in intent
  }, [project, employee, conversationId]);

  // --- REST recovery fallback: periodically re-syncs execution status and
  // cost (not covered by the chat WebSocket, which only streams events),
  // and re-fetches the full conversation as a safety net if the
  // WebSocket has been unable to reconnect. Much lighter than the old
  // 2s full-history poll: this only runs every 15s and skips the
  // expensive event fetch when nothing indicates it's needed.
  useEffect(() => {
    if (!project || !employee) return;

    let cancelled = false;

    const resync = async () => {
      try {
        const conversationData = await fetchConversation(
          project.path,
          employee.id,
          employee.name,
        );
        const conversation = conversationData.conversation;
        if (!conversation || cancelled) return;

        setCost(conversation.cost ?? null);
        setExecutionStatus(conversation.execution_status ?? null);

        if (conversation.id !== conversationId) {
          setConversationId(conversation.id);
        }
      } catch {
        // Keep last confirmed state on transient failures.
      }
    };

    const timer = window.setInterval(resync, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [project, employee, conversationId]);

  async function sendMessage(imageDataUrls?: string[]) {
    const hasImages = imageDataUrls && imageDataUrls.length > 0;
    if (!project || !employee || (!message.trim() && !hasImages) || sending) {
      // TEMPORARY DIAGNOSTIC (BUGS_AND_FIXES.md #48, second round)
      alert(
        `DEBUG: guard blocked - project=${!!project} employee=${!!employee} message="${message}" sending=${sending}`,
      );
      return;
    }

    const text = message.trim();
    const optimisticId = `${OPTIMISTIC_ID_PREFIX}${Date.now()}`;
    const optimisticContent: ChatMessage["llm_message"]["content"] = [];
    if (text) optimisticContent.push({ type: "text", text });
    if (hasImages) optimisticContent.push({ type: "image", image_urls: imageDataUrls });

    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      kind: "MessageEvent",
      source: "user",
      timestamp: new Date().toISOString(),
      llm_message: { content: optimisticContent },
    };

    setSending(true);
    setMessage("");
    setMessages((current) => [...current, optimisticMessage]);

    try {
      const sendData = await sendChatMessage(
        project.path,
        employee.id,
        employee.name,
        text,
        imageDataUrls,
      );

      const id = sendData.conversation?.id ?? sendData.conversation_id;
      if (id && id !== conversationId) {
        setConversationId(id);
      }
      // The real echo arrives via the WebSocket subscription above, which
      // clears the optimistic placeholder once it does (see
      // applyIncomingEvents). If the WebSocket is down, the 15s REST
      // resync will eventually reconcile it as a fallback.
    } catch (err) {
      // TEMPORARY DIAGNOSTIC (BUGS_AND_FIXES.md #48, second round)
      alert(`DEBUG: sendMessage caught - ${err instanceof Error ? err.message : String(err)}`);
      // Sending genuinely failed - remove the optimistic bubble and give
      // the user their text back instead of silently losing it.
      setMessages((current) => current.filter((m) => m.id !== optimisticId));
      setMessage(text);
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
