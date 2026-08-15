import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type {
  ActivityEvent,
  AgentProfile,
  ChatMessage,
  ConversationCost,
  ConversationExecutionStatus,
  WorkPlan,
} from "../types";
import EmployeeInsightsPanel from "../components/EmployeeInsightsPanel";
import { formatMessageTime } from "../utils/formatMessageTime";

type Props = {
  language: "ar" | "en";
  employee: AgentProfile;
  messages: ChatMessage[];
  activity: ActivityEvent[];
  workPlan: WorkPlan | null;
  cost: ConversationCost | null;
  executionStatus: ConversationExecutionStatus | null;
  message: string;
  sending: boolean;
  setMessage: (value: string) => void;
  sendMessage: () => Promise<void>;
};

/**
 * Body content for the chat screen. The global header and back
 * navigation live in AppHeader/BreadcrumbBar (rendered once by App.tsx).
 * This component keeps a small employee-identity bar (avatar/name/role)
 * since that's chat-specific context, not general navigation - but it's
 * a plain div, not a second <header>, to avoid two headers on one page.
 */
export default function ChatScreen({
  language,
  employee,
  messages,
  activity,
  workPlan,
  cost,
  executionStatus,
  message,
  sending,
  setMessage,
  sendMessage,
}: Props) {
  const employeeName =
    language === "ar" ? employee.displayNameAr : employee.displayNameEn;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);

  // Land on the latest message whenever the conversation opens or a new
  // message arrives, instead of showing the top and requiring a manual
  // scroll every time - matches normal chat-app behavior.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // The composer grows with its content (see the textarea below); resize
  // it here since a plain CSS `height:auto` doesn't work for a fixed-
  // position element sized by its own scrollHeight.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [message]);

  // The composer's actual rendered height changes as it grows/shrinks
  // with content - track it via ResizeObserver and expose it as a CSS
  // variable, so the message list's bottom padding always matches
  // exactly (a fixed padding guess would either waste space or let the
  // composer cover the last message, which is exactly what was
  // reported).
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        "--composer-height",
        `${entry.contentRect.height}px`,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="app project-view chat-screen">
      <div className="chat-screen-person">
        <div className="chat-employee-avatar">
          {employee.avatarUrl ? (
            <img src={employee.avatarUrl} alt={employeeName ?? employee.name} />
          ) : (
            (employeeName?.slice(0, 1) ?? "?")
          )}
        </div>

        <div className="chat-employee-info">
          <strong>{employeeName}</strong>
          <span>{employee.role}</span>
        </div>
      </div>

      <EmployeeInsightsPanel
        language={language}
        activity={activity}
        executionStatus={executionStatus}
        cost={cost}
        workPlan={workPlan}
      />
      <section className="chat">
        {messages.map((event) => {
          const text = event.llm_message.content.map((item) => item.text).join("\n");
          const time = formatMessageTime(event.timestamp, language);
          const isUser = event.source === "user";

          return (
            <article key={event.id} className={isUser ? "me" : "agent-message"}>
              {!isUser && (
                <div className="agent-message-header">
                  <div className="agent-message-avatar">
                    {employee.avatarUrl ? (
                      <img src={employee.avatarUrl} alt={employeeName ?? employee.name} />
                    ) : (
                      (employeeName?.slice(0, 1) ?? "?")
                    )}
                  </div>
                  <b>{employeeName}</b>
                </div>
              )}

              <div className="message-markdown">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>

              {time && <time className="message-time">{time}</time>}
            </article>
          );
        })}

        <div ref={messagesEndRef} />
      </section>

      <form
        ref={composerRef}
        className="composer"
        onSubmit={async (event) => {
          event.preventDefault();
          await sendMessage();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={language === "ar" ? "اكتب رسالة..." : "Write a message..."}
        />

        <button
          type="submit"
          className="composer-send"
          disabled={sending}
          aria-label="send"
        >
          {sending ? "…" : "↑"}
        </button>
      </form>
    </main>
  );
}
