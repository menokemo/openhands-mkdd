import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { FaPaperclip, FaFileArrowUp, FaXmark } from "react-icons/fa6";
import type {
  ActivityEvent,
  AgentProfile,
  ChatMessage,
  ConversationCost,
  ConversationExecutionStatus,
  WorkPlan,
  Workspace,
} from "../types";
import EmployeeInsightsPanel from "../components/EmployeeInsightsPanel";
import { formatMessageTime } from "../utils/formatMessageTime";
import { detectPreviewLinks } from "../utils/detectPreviewLinks";
import { uploadProjectFiles } from "../api/client";

type Props = {
  language: "ar" | "en";
  employee: AgentProfile;
  project: Workspace;
  onBack: () => void;
  messages: ChatMessage[];
  activity: ActivityEvent[];
  workPlan: WorkPlan | null;
  cost: ConversationCost | null;
  executionStatus: ConversationExecutionStatus | null;
  message: string;
  sending: boolean;
  setMessage: (value: string) => void;
  sendMessage: (imageDataUrls?: string[], overrideText?: string) => Promise<void>;
  startFreshConversation: (imageDataUrls?: string[]) => Promise<void>;
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
  project,
  onBack,
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
}: Props) {
  const employeeName =
    language === "ar" ? employee.displayNameAr : employee.displayNameEn;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const genericFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // The project's slug on disk is the last path segment (e.g.
  // "/projects/test-site" -> "test-site") - matches the same computation
  // used elsewhere (ProjectHomeScreen.tsx's owner-upload feature) for
  // the exact same reason: uploadProjectFiles needs the on-disk slug,
  // not the full workspace path.
  const projectSlug = project.path.split("/").filter(Boolean).pop() ?? "";

  async function handleGenericFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setUploadingFile(true);
    try {
      await uploadProjectFiles(projectSlug, files);

      // OpenHands' own message protocol only supports text and image
      // content (confirmed directly from the customized Agent Canvas
      // source's MessageContent type - no generic "file" attachment
      // exists) - so a non-image file can't be sent as a chat
      // attachment the way an image can. Instead it's uploaded to the
      // project's real uploads/ folder (same mechanism as the Project
      // Home owner-upload feature) and the employee is notified via an
      // ordinary text message, so they know to look for it rather than
      // relying on noticing it during an unrelated filesystem check.
      const names = files.map((f) => f.name).join("، ");
      const notice =
        files.length === 1
          ? language === "ar"
            ? `رفعت ملف جديد للمشروع: ${names} — تقدر تلاقيه في مجلد uploads/.`
            : `Uploaded a new file to the project: ${names} — you'll find it in the uploads/ folder.`
          : language === "ar"
            ? `رفعت ${files.length} ملفات جديدة للمشروع: ${names} — تقدر تلاقيهم في مجلد uploads/.`
            : `Uploaded ${files.length} new files to the project: ${names} — you'll find them in the uploads/ folder.`;

      await sendMessage(undefined, notice);
    } catch {
      alert(
        language === "ar" ? "فشل رفع الملف، حاول تاني" : "File upload failed, try again",
      );
    } finally {
      setUploadingFile(false);
    }
  }

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
        <div className="chat-role-badge">{employee.role}</div>

        <div className="chat-screen-person-row">
          <button
            type="button"
            className="chat-back-button"
            onClick={onBack}
            aria-label={language === "ar" ? "رجوع" : "Back"}
          >
            ←
          </button>

          <div className="chat-employee-avatar">
            {employee.avatarUrl ? (
              <img src={employee.avatarUrl} alt={employeeName ?? employee.name} />
            ) : (
              (employeeName?.slice(0, 1) ?? "?")
            )}
          </div>

          <div className="chat-employee-info">
            <strong>{employeeName}</strong>
          </div>

          <button
            type="button"
            className="chat-new-conversation-button"
            disabled={sending}
            onClick={() => {
              if (!message.trim() && pendingImages.length === 0) {
                alert(
                  language === "ar"
                    ? "اكتب رسالتك الأولى في صندوق الكتابة الأول، وبعدين دوس محادثة جديدة"
                    : "Type your first message in the composer first, then press New conversation",
                );
                return;
              }

              const confirmed = window.confirm(
                language === "ar"
                  ? "هتبدأ محادثة جديدة تمامًا مع الموظف ده. المحادثة الحالية هتفضل موجودة (تقدر توصلها من واجهة OpenHands الأصلية)، بس هتبقى مش النشطة بعد كده. متأكد؟"
                  : "This will start a completely new conversation with this employee. The current conversation stays intact (reachable from OpenHands's own UI) but will no longer be the active one. Continue?",
              );
              if (confirmed)
                startFreshConversation(
                  pendingImages.length > 0 ? pendingImages : undefined,
                );
            }}
          >
            {language === "ar" ? "محادثة جديدة" : "New conversation"}
          </button>

          <EmployeeInsightsPanel
            language={language}
            activity={activity}
            executionStatus={executionStatus}
            cost={cost}
            workPlan={workPlan}
          />
        </div>
      </div>

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

              {detectPreviewLinks(textParts).map((link) =>
                link.kind === "live-port" ? (
                  <a
                    key={`live-port-${link.port}-${link.path}`}
                    className="live-app-card"
                    href={`${window.location.protocol}//${window.location.hostname}:${link.port}/${link.path}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="live-app-badge">
                      {language === "ar" ? "شغال الآن" : "Live now"}
                    </span>
                    <span className="live-app-label">:{link.port}</span>
                    <span className="live-app-open">
                      {language === "ar" ? "افتح التطبيق ←" : "Open app →"}
                    </span>
                  </a>
                ) : (
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
                ),
              )}

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

          <button
            type="button"
            className="composer-attach"
            onClick={() => genericFileInputRef.current?.click()}
            disabled={uploadingFile}
            aria-label={
              language === "ar" ? "رفع ملف للمشروع" : "Upload a file to the project"
            }
          >
            <FaFileArrowUp />
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

          <input
            ref={genericFileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const fileList = event.target.files;
              event.target.value = "";
              void handleGenericFileUpload(fileList);
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
