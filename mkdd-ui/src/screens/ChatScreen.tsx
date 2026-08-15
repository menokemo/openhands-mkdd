import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { FaPaperclip, FaXmark } from "react-icons/fa6";
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
import { detectPreviewLinks } from "../utils/detectPreviewLinks";

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
  sendMessage: (imageDataUrls?: string[]) => Promise<void>;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("file_read_failed"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });

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
          const textParts = event.llm_message.content
            .filter(
              (item): item is { type: "text"; text: string } => item.type === "text",
            )
            .map((item) => item.text)
            .join("\n");
          const imageUrls = event.llm_message.content
            .filter(
              (item): item is { type: "image"; image_urls: string[] } =>
                item.type === "image",
            )
            .flatMap((item) => item.image_urls);
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

              {imageUrls.length > 0 && (
                <div className="message-images">
                  {imageUrls.map((src, i) => (
                    <img key={i} src={src} alt="" className="message-image" />
                  ))}
                </div>
              )}

              {textParts && (
                <div className="message-markdown">
                  <ReactMarkdown>{textParts}</ReactMarkdown>
                </div>
              )}

              {detectPreviewLinks(textParts).map((link) => (
                <a
                  key={link.url}
                  className="preview-link-card"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <iframe
                    src={link.url}
                    title={link.filePath}
                    className="preview-link-frame"
                    sandbox=""
                  />
                  <span className="preview-link-label">{link.filePath}</span>
                </a>
              ))}

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
          const images = pendingImages;
          setPendingImages([]);
          await sendMessage(images.length > 0 ? images : undefined);
        }}
      >
        {pendingImages.length > 0 && (
          <div className="composer-attachments">
            {pendingImages.map((src, i) => (
              <div className="composer-attachment" key={i}>
                <img src={src} alt="" />
                <button
                  type="button"
                  className="composer-attachment-remove"
                  onClick={() =>
                    setPendingImages((current) => current.filter((_, idx) => idx !== i))
                  }
                  aria-label={language === "ar" ? "إزالة" : "Remove"}
                >
                  <FaXmark />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer-row">
          <button
            type="button"
            className="composer-attach"
            onClick={() => fileInputRef.current?.click()}
            aria-label={language === "ar" ? "إرفاق صورة" : "Attach image"}
          >
            <FaPaperclip />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length === 0) return;

              const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
              setPendingImages((current) => [...current, ...dataUrls].slice(0, 4));
            }}
          />

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
        </div>
      </form>
    </main>
  );
}
