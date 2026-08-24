import { WebSocketServer, WebSocket as UpstreamWebSocket } from "ws";
import { OPENHANDS_URL, sessionKey, invalidateSessionKey } from "./openhands-client.mjs";
import { findAuthorizedConversation } from "./authorize-conversation.mjs";
import { normalizeEvent } from "./normalize-event.mjs";
import { sendPushToAll } from "./push-notifications.mjs";
import { currentUser } from "../routes/auth.mjs";

/**
 * Secure realtime chat bridge — implements Phase C of
 * REALTIME_CHAT_RESEARCH.md.
 *
 * Browser  <--WS-->  MKDD backend (this file)  <--WS-->  OpenHands Agent Server
 *
 * The browser never receives the OpenHands session API key (security
 * principle #1 in README section 46). This module:
 *   1. Accepts a browser WebSocket connection at /ws/chat.
 *   2. Re-validates project/employee/conversation ownership using the
 *      SAME shared authorization function every REST route uses
 *      (findAuthorizedConversation) — a WebSocket upgrade request is a
 *      new, separate access decision, not something inherited from
 *      whatever REST calls happened earlier in the page's lifetime.
 *   3. Opens its own upstream WebSocket to OpenHands' real endpoint
 *      (confirmed in REALTIME_CHAT_RESEARCH.md section 1-2:
 *      ws(s)://<host>/sockets/events/{conversationId}, authenticated by
 *      sending {type:"auth", session_api_key} as the first message).
 *   4. Normalizes every incoming event with the SAME normalizeEvent()
 *      REST history uses, so the two transports can never drift apart
 *      (this was "Phase A" — already shared before this bridge existed).
 *   5. Forwards only normalized, safe event payloads downstream.
 */

function toWebSocketUrl(httpUrl) {
  return httpUrl.replace(/^http/, "ws");
}

export function attachChatWebSocketBridge(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://mkdd.local");

    if (url.pathname !== "/ws/chat") {
      socket.destroy();
      return;
    }

    if (!currentUser(req)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (browserSocket) => {
      wss.emit("connection", browserSocket, url);
    });
  });

  wss.on("connection", async (browserSocket, url) => {
    const conversationId = url.searchParams.get("conversation");
    const project = url.searchParams.get("project");
    const employeeId = url.searchParams.get("employeeId");
    const employeeName = url.searchParams.get("employeeName");

    if (!conversationId || !project || !employeeId || !employeeName) {
      browserSocket.close(4400, "missing_params");
      return;
    }

    let authorized;
    try {
      authorized = await findAuthorizedConversation({
        conversationId,
        project,
        employeeId,
        employeeName,
      });
    } catch {
      browserSocket.close(1011, "authorization_check_failed");
      return;
    }

    if (!authorized) {
      browserSocket.close(4403, "conversation_employee_mismatch");
      return;
    }

    const upstreamUrl = `${toWebSocketUrl(OPENHANDS_URL)}/sockets/events/${conversationId}`;

    let currentUpstream = null;

    /**
     * Opens (or reopens, on retry) the upstream connection to
     * OpenHands' event WebSocket for this conversation, authenticating
     * with the current session key. If the connection closes/errors
     * before ever receiving a single message, that's a strong signal
     * the auth message itself was rejected (BUGS_AND_FIXES.md #137) -
     * most likely because the cached session key (see openhands-
     * client.mjs's caching from #124) went stale, e.g. after
     * agent-canvas restarted independently of this container. REST
     * calls already retry this automatically via openhands()/
     * openhandsFetch(); this WebSocket bridge never had that, and a
     * connection failing here previously meant this feature stayed
     * silently broken until mkdd-ui itself was restarted - forcing the
     * owner to rely on manual refresh instead of live updates.
     */
    function connectUpstream(isRetry) {
      const upstream = new UpstreamWebSocket(upstreamUrl);
      currentUpstream = upstream;
      let receivedAnyMessage = false;

      upstream.on("open", () => {
        // Auth message shape confirmed in
        // openhands-agent-canvas/src/utils/websocket-auth.ts.
        upstream.send(JSON.stringify({ type: "auth", session_api_key: sessionKey() }));
      });

      upstream.on("message", (data) => {
        receivedAnyMessage = true;

        let rawEvent;
        try {
          rawEvent = JSON.parse(data.toString());
        } catch {
          return; // ignore malformed frames rather than crashing the bridge
        }

        const normalized = normalizeEvent(rawEvent);
        if (normalized && browserSocket.readyState === browserSocket.OPEN) {
          browserSocket.send(JSON.stringify({ type: "event", event: normalized }));
        }

        // Push notification for a genuine new agent message (BUGS_AND_FIXES.md
        // #107) - never for the owner's own messages, and never blocks/
        // delays delivering the event to the open browser tab above.
        if (normalized?.kind === "MessageEvent" && normalized.source === "agent") {
          const firstTextBlock = normalized.llm_message?.content?.find(
            (item) => item.type === "text",
          );
          const preview = firstTextBlock?.text?.slice(0, 120) ?? "";

          void sendPushToAll({
            title: employeeName,
            body: preview,
            // No per-conversation deep link exists yet (MKDD is a
            // client-side-state SPA, not URL-routed per conversation) -
            // opens the app root; the owner navigates from there.
            url: "/",
            tag: `mkdd-message-${employeeId}`,
          });
        }
      });

      function handleUpstreamDown() {
        if (!receivedAnyMessage && !isRetry) {
          invalidateSessionKey();
          connectUpstream(true);
          return;
        }
        if (browserSocket.readyState === browserSocket.OPEN) {
          browserSocket.close(1011, "upstream_unavailable");
        }
      }

      upstream.on("close", handleUpstreamDown);
      upstream.on("error", handleUpstreamDown);
    }

    connectUpstream(false);

    // Registered ONCE, outside connectUpstream, so a retry never
    // duplicates these listeners - always closes whichever upstream
    // connection is current at the time (currentUpstream is kept in
    // sync by connectUpstream on every call, including the retry).
    browserSocket.on("close", () => {
      if (
        currentUpstream?.readyState === UpstreamWebSocket.OPEN ||
        currentUpstream?.readyState === UpstreamWebSocket.CONNECTING
      ) {
        currentUpstream.close();
      }
    });

    browserSocket.on("error", () => {
      if (
        currentUpstream?.readyState === UpstreamWebSocket.OPEN ||
        currentUpstream?.readyState === UpstreamWebSocket.CONNECTING
      ) {
        currentUpstream.close();
      }
    });
  });

  return wss;
}
