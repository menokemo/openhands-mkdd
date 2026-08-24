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
import {
  fetchConversation,
  fetchChatOpen,
  fetchOlderEvents,
  sendChatMessage,
  startNewConversation,
} from "../api/client";

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
  const [isOpeningConversation, setIsOpeningConversation] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [workPlan, setWorkPlan] = useState<WorkPlan | null>(null);
  const [cost, setCost] = useState<ConversationCost | null>(null);
  const [executionStatus, setExecutionStatus] =
    useState<ConversationExecutionStatus | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [oldestPageId, setOldestPageId] = useState<string | null>(null);

  // Reflects incoming events into state, dropping any optimistic
  // placeholder once a real (non-optimistic) message has actually arrived
  // - see sendMessage() below for where the placeholder is added.
  function applyIncomingEvents(
    events: ConversationEvent[],
    newWorkPlan: WorkPlan | null | undefined,
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

  // --- Initial REST load: resolves the conversation AND its most
  // recent messages in a SINGLE request (BUGS_AND_FIXES.md #121).
  // Previously this was two sequential requests - fetchConversation,
  // then fetchEvents (which pulled the ENTIRE conversation history,
  // sometimes hundreds of KB across dozens of pages) - only starting
  // once the first fully resolved. handleChatOpen on the backend
  // resolves the conversation once and returns just the most recent
  // page of messages together, matching how a real messaging app opens
  // instantly with recent messages, loading older ones on demand (see
  // loadOlderMessages below). This stays REST-only (Phase D keeps REST
  // for initial history + recovery, per REALTIME_CHAT_RESEARCH.md).
  useEffect(() => {
    setMessages([]);
    setActivity([]);
    setWorkPlan(null);
    setCost(null);
    setExecutionStatus(null);
    setConversationId(null);
    setHasOlderMessages(false);
    setOldestPageId(null);

    if (!project || !employee) return;

    setIsOpeningConversation(true);
    let cancelled = false;

    fetchChatOpen(project.path, employee.id, employee.name)
      .then((data) => {
        const conversation = data.conversation;
        if (cancelled) return;
        setIsOpeningConversation(false);
        if (!conversation) return;

        applyIncomingEvents(data.items ?? [], data.work_plan ?? null);
        setCost(conversation.cost ?? null);
        setExecutionStatus(conversation.execution_status ?? null);
        setConversationId(conversation.id);
        setHasOlderMessages(data.hasMore ?? false);
        setOldestPageId(data.nextPageId ?? null);
      })
      .catch(() => {
        // Keep the last known-good conversation state visible.
        if (!cancelled) setIsOpeningConversation(false);
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
            applyIncomingEvents([payload.event], undefined);
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

  async function sendMessage(imageDataUrls?: string[], overrideText?: string) {
    const hasImages = imageDataUrls && imageDataUrls.length > 0;
    const text = (overrideText ?? message).trim();
    if (!project || !employee || (!text && !hasImages) || sending) return;

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
    } catch {
      // Sending genuinely failed - remove the optimistic bubble and give
      // the user their text back instead of silently losing it.
      setMessages((current) => current.filter((m) => m.id !== optimisticId));
      setMessage(text);
    } finally {
      setSending(false);
    }
  }

  /**
   * Always starts a brand-new conversation with this employee, even if
   * one already exists - for when an existing conversation is stuck in
   * an unrecoverable state (BUGS_AND_FIXES.md #61). Clears the current
   * message list since this is a genuinely fresh conversation, not a
   * continuation of the old one - the old conversation and its history
   * remain intact and reachable directly in OpenHands's own UI, just no
   * longer the one MKDD resolves to for this project+employee.
   */
  async function startFreshConversation(imageDataUrls?: string[]) {
    const hasImages = imageDataUrls && imageDataUrls.length > 0;
    if (!project || !employee || (!message.trim() && !hasImages) || sending) return;

    const text = message.trim();
    setSending(true);
    setMessage("");

    try {
      const sendData = await startNewConversation(
        project.path,
        employee.id,
        employee.name,
        text,
        imageDataUrls,
      );

      const id = sendData.conversation?.id ?? sendData.conversation_id;
      setMessages([]);
      if (id) setConversationId(id);
    } catch {
      setMessage(text);
    } finally {
      setSending(false);
    }
  }

  /**
   * Loads the next (older) page of messages when the owner scrolls to
   * the top of the chat (BUGS_AND_FIXES.md #121) - mergeById (used by
   * applyIncomingEvents) sorts by timestamp, so older messages fetched
   * here naturally land above the existing ones regardless of fetch
   * order, no special merge logic needed here beyond the existing one.
   */
  async function loadOlderMessages() {
    if (!project || !employee || !conversationId || !oldestPageId || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const response = await fetchOlderEvents(
        conversationId,
        project.path,
        employee.id,
        employee.name,
        oldestPageId,
      );
      applyIncomingEvents(response.items, undefined);
      setHasOlderMessages(response.hasMore);
      setOldestPageId(response.nextPageId);
    } catch {
      // Leave hasOlderMessages/oldestPageId as-is so the owner can retry.
    } finally {
      setLoadingOlder(false);
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
    startFreshConversation,
    hasOlderMessages,
    loadingOlder,
    loadOlderMessages,
    isOpeningConversation,
  };
}
