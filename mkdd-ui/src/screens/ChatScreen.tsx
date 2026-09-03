import { Fragment, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  FaPaperclip,
  FaFileArrowUp,
  FaXmark,
  FaCopy,
  FaCheck,
  FaChevronDown,
} from "react-icons/fa6";
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
import { markConversationAsViewed } from "../utils/lastViewed";
import { statusColorClass } from "../utils/employeeStatusColor";
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
  sendError: string | null;
  setMessage: (value: string) => void;
  sendMessage: (imageDataUrls?: string[], overrideText?: string) => Promise<void>;
  startFreshConversation: (imageDataUrls?: string[]) => Promise<void>;
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  isOpeningConversation: boolean;
  openError: string | null;
  loadOlderMessages: () => Promise<void>;
};

// BUGS_AND_FIXES.md #218: Telegram-style date divider label - "today"/
// "yesterday" for the two most recent days, a full weekday+date
// otherwise. numberingSystem: "latn" explicitly forced - ar-EG alone
// produces Arabic-Indic numerals (confirmed live in #172/#206, the
// exact same locale quirk), so this avoids reintroducing it here.
function formatDateDivider(isoTimestamp: string, language: "ar" | "en"): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000,
  );

  if (dayDiff === 0) return language === "ar" ? "اليوم" : "Today";
  if (dayDiff === 1) return language === "ar" ? "أمس" : "Yesterday";

  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    numberingSystem: "latn",
  }).format(date);
}

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
  sendError,
  setMessage,
  sendMessage,
  startFreshConversation,
  hasOlderMessages,
  loadingOlder,
  isOpeningConversation,
  openError,
  loadOlderMessages,
}: Props) {
  const employeeName =
    language === "ar" ? employee.displayNameAr : employee.displayNameEn;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLElement>(null);
  const scrollHeightBeforeLoadRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const genericFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [openingTakingLong, setOpeningTakingLong] = useState(false);
  // BUGS_AND_FIXES.md #197: a report-delivery message renders as a
  // compact badge (see the messages.map below) - this tracks which
  // report's full text is currently shown in the popup, if any.
  const [openReportText, setOpenReportText] = useState<string | null>(null);
  // BUGS_AND_FIXES.md #198: tracks which message was just copied, to
  // show brief "Copied" feedback before reverting to the copy icon.
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  // BUGS_AND_FIXES.md #220: tracks whether the owner is currently near
  // the bottom of the chat - drives both the "jump to latest" button
  // (WhatsApp/Telegram-style) and whether new messages should
  // auto-scroll into view at all.
  const [isNearBottom, setIsNearBottom] = useState(true);
  // BUGS_AND_FIXES.md #221: header now only shows avatar+name+back -
  // tapping the avatar opens the full profile (role, status, cost,
  // work plan, new-conversation action) via EmployeeInsightsPanel.
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!isOpeningConversation) {
      setOpeningTakingLong(false);
      return;
    }
    const timer = setTimeout(() => setOpeningTakingLong(true), 8000);
    return () => clearTimeout(timer);
  }, [isOpeningConversation]);

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
  // scroll every time - matches normal chat-app behavior. BUT if this
  // messages.length change came from loadOlderMessages prepending older
  // messages ABOVE the current view (BUGS_AND_FIXES.md #121), jumping
  // to the end would be exactly wrong - restore the owner's visual
  // scroll position instead, compensating for the new content's height.
  useEffect(() => {
    const container = chatContainerRef.current;

    if (container && scrollHeightBeforeLoadRef.current !== null) {
      const heightDiff = container.scrollHeight - scrollHeightBeforeLoadRef.current;
      container.scrollTop += heightDiff;
      scrollHeightBeforeLoadRef.current = null;
      return;
    }

    // BUGS_AND_FIXES.md #220: only jump to the latest message when the
    // owner is already near the bottom - if they've scrolled up to read
    // older history, a new incoming message must not yank them back
    // down. isNearBottom is force-set to true right before sending a
    // message (see the composer's onSubmit below), so the owner's own
    // sent messages still always scroll into view.
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length, isNearBottom]);

  /**
   * Triggered when the owner scrolls near the top of the chat
   * (BUGS_AND_FIXES.md #121) - saves the current scroll height before
   * requesting older messages, so the effect above can compensate and
   * keep the same messages visually in view once they're prepended.
   */
  function handleScroll() {
    const container = chatContainerRef.current;
    if (!container) return;

    // BUGS_AND_FIXES.md #220: "near bottom" tolerance of 80px - close
    // enough that new messages arriving still feel continuous, not so
    // tight that a slightly-off scroll position wrongly shows the
    // jump-to-latest button when the owner is effectively already there.
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsNearBottom(distanceFromBottom < 80);

    if (!hasOlderMessages || loadingOlder) return;

    if (container.scrollTop < 60) {
      scrollHeightBeforeLoadRef.current = container.scrollHeight;
      void loadOlderMessages();
    }
  }

  // Clears the pending scroll-compensation marker once loadOlderMessages
  // finishes (loadingOlder true -> false), whether it succeeded or
  // failed - loadOlderMessages swallows its own errors internally
  // (never rejects), so a .catch() on the call above could never
  // actually fire; watching loadingOlder itself is the only reliable
  // "the attempt is over" signal. On success, messages.length also
  // changed, so the scroll-restore effect above already consumed and
  // cleared the ref by the time this runs - this only matters for the
  // failure case, where messages.length never changed and the ref
  // would otherwise stay stuck with a stale value.
  useEffect(() => {
    if (!loadingOlder) {
      scrollHeightBeforeLoadRef.current = null;
    }
  }, [loadingOlder]);

  // Mark as viewed both when this chat first opens AND whenever new
  // messages arrive while it's still open (BUGS_AND_FIXES.md #106) -
  // otherwise a message that arrives while the owner is actively
  // looking at the chat would still show as "unread" on the team strip
  // the next time they leave and check it.
  useEffect(() => {
    markConversationAsViewed(employee.id);
  }, [employee.id, messages.length]);

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
        <div className="chat-screen-person-row">
          <button
            type="button"
            className="chat-back-button"
            onClick={onBack}
            aria-label={language === "ar" ? "رجوع" : "Back"}
          >
            ←
          </button>

          <button
            type="button"
            className={`chat-employee-avatar chat-employee-avatar-button ${statusColorClass(executionStatus)}`}
            onClick={() => setProfileOpen(true)}
            aria-label={language === "ar" ? "بيانات الموظف" : "Employee profile"}
          >
            {employee.avatarUrl ? (
              <img src={employee.avatarUrl} alt={employeeName ?? employee.name} />
            ) : (
              (employeeName?.slice(0, 1) ?? "?")
            )}
          </button>

          <div className="chat-employee-info">
            <strong>{employeeName}</strong>
          </div>

          <EmployeeInsightsPanel
            language={language}
            activity={activity}
            executionStatus={executionStatus}
            cost={cost}
            workPlan={workPlan}
            currentLlmProfileRef={employee.llm_profile_ref}
            project={project.path}
            employeeId={employee.id}
            employeeName={employeeName ?? employee.name}
            employeeRole={employee.role ?? undefined}
            employeeAvatarUrl={employee.avatarUrl ?? undefined}
            openOverride={profileOpen}
            onOpenChange={setProfileOpen}
            onStartNewConversation={() => {
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
              if (confirmed) {
                setProfileOpen(false);
                startFreshConversation(
                  pendingImages.length > 0 ? pendingImages : undefined,
                );
              }
            }}
          />
        </div>
      </div>

      <section className="chat" ref={chatContainerRef} onScroll={handleScroll}>
        {isOpeningConversation && messages.length === 0 && (
          <div className="chat-loading-initial">
            <div>
              {language === "ar" ? "جاري تحميل المحادثة…" : "Loading conversation…"}
            </div>
            {openingTakingLong && (
              <div className="chat-loading-initial-hint">
                {language === "ar"
                  ? "أول تحميل لهذا الموظف قد يستغرق وقتًا أطول قليلاً"
                  : "First load for this employee can take a bit longer"}
              </div>
            )}
          </div>
        )}
        {openError && messages.length === 0 && (
          <div className="chat-loading-initial chat-open-error">
            <div>
              {language === "ar"
                ? "حصل خطأ أثناء فتح المحادثة"
                : "An error occurred while opening the conversation"}
            </div>
            <pre className="error-boundary-detail">{openError}</pre>
          </div>
        )}
        {!isOpeningConversation &&
          !openError &&
          messages.length === 0 &&
          activity.length > 0 && (
            <div className="chat-loading-initial chat-working-no-messages">
              <div>
                {executionStatus === "running"
                  ? language === "ar"
                    ? "الموظف شغال حاليًا - لسه مبعتش أي رسالة نصية"
                    : "The employee is currently working - no text message sent yet"
                  : language === "ar"
                    ? "مفيش رسائل نصية حديثة، بس فيه أوامر تنفيذية حقيقية اتنفَّذت"
                    : "No recent text messages, but real executed actions exist"}
              </div>
              <div className="chat-loading-initial-hint">
                {language === "ar"
                  ? 'شوف تاب "النشاط" في بيانات الموظف لمتابعة الأوامر التنفيذية'
                  : 'Check the "Activity" tab in Employee details to see the executed actions'}
              </div>
            </div>
          )}
        {loadingOlder && (
          <div className="chat-loading-older">
            {language === "ar" ? "جاري تحميل رسائل أقدم…" : "Loading older messages…"}
          </div>
        )}
        {messages.map((event, index) => {
          const previousEvent = index > 0 ? messages[index - 1] : null;

          // BUGS_AND_FIXES.md #218: Telegram-style date divider,
          // whenever the calendar day changes between consecutive
          // messages.
          const showDateDivider =
            event.timestamp &&
            (!previousEvent?.timestamp ||
              new Date(event.timestamp).toDateString() !==
                new Date(previousEvent.timestamp).toDateString());

          // BUGS_AND_FIXES.md #218: "new conversation started" divider,
          // whenever the underlying real conversation changes between
          // consecutive messages (crossing a "start new conversation"
          // break while scrolling back through history). Only shown
          // once both messages actually have a known conversationId -
          // live messages during the active session share the same one
          // and never trigger this.
          const showConversationDivider =
            index > 0 &&
            event.conversationId &&
            previousEvent?.conversationId &&
            event.conversationId !== previousEvent.conversationId;

          const dividers = (
            <>
              {showConversationDivider && (
                <div className="chat-conversation-divider">
                  <span>
                    {language === "ar"
                      ? "بداية محادثة جديدة"
                      : "New conversation started"}
                  </span>
                </div>
              )}
              {showDateDivider && event.timestamp && (
                <div className="chat-date-divider">
                  <span>{formatDateDivider(event.timestamp, language)}</span>
                </div>
              )}
            </>
          );

          const textParts = event.llm_message.content
            .filter(
              (item): item is { type: "text"; text: string } => item.type === "text",
            )
            .map((item) => item.text)
            .join("\n");

          // BUGS_AND_FIXES.md #197: a delivered inter-employee report -
          // compact badge, not a full bubble; tapping it opens the real
          // content in a popup instead.
          if (event.isReportDelivery) {
            return (
              <Fragment key={event.id}>
                {dividers}
                <button
                  type="button"
                  className="report-delivery-badge"
                  onClick={() => setOpenReportText(textParts)}
                >
                  {language === "ar" ? "📋 تقرير من موظف" : "📋 Report from an employee"}
                </button>
              </Fragment>
            );
          }

          const imageUrls = event.llm_message.content
            .filter(
              (item): item is { type: "image"; image_urls: string[] } =>
                item.type === "image",
            )
            .flatMap((item) => item.image_urls);
          const time = formatMessageTime(event.timestamp, language);
          const isUser = event.source === "user";

          return (
            <Fragment key={event.id}>
              {dividers}
              <article className={isUser ? "me" : "agent-message"}>
                {!isUser && (
                  <div className="agent-message-header">
                    <div className="agent-message-avatar">
                      {employee.avatarUrl ? (
                        <img
                          src={employee.avatarUrl}
                          alt={employeeName ?? employee.name}
                        />
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

                {detectPreviewLinks(textParts).map((link) => {
                  if (link.kind !== "live-port") {
                    return (
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
                    );
                  }

                  // Live-app links (BUGS_AND_FIXES.md #125) only stay valid
                  // while the underlying live server process is still
                  // running - unlike a static preview link (a real file on
                  // disk), which stays valid indefinitely. That process
                  // typically only runs for the duration of an active work
                  // session, so a message old enough that the session very
                  // likely ended gets a visible "may be expired" warning
                  // instead of implying it's definitely still live.
                  const ONE_HOUR_MS = 60 * 60 * 1000;
                  const messageAgeMs = event.timestamp
                    ? Date.now() - new Date(event.timestamp).getTime()
                    : 0;
                  const mayBeExpired = messageAgeMs > ONE_HOUR_MS;

                  return (
                    <a
                      key={`live-port-${link.port}-${link.path}`}
                      className={
                        "live-app-card" +
                        (mayBeExpired ? " live-app-card-maybe-expired" : "")
                      }
                      href={`${window.location.protocol}//${window.location.hostname}:${link.port}/${link.path}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="live-app-badge">
                        {mayBeExpired
                          ? language === "ar"
                            ? "قد يكون منتهي"
                            : "May be expired"
                          : language === "ar"
                            ? "شغال الآن"
                            : "Live now"}
                      </span>
                      <span className="live-app-label">:{link.port}</span>
                      <span className="live-app-open">
                        {language === "ar" ? "افتح التطبيق ←" : "Open app →"}
                      </span>
                    </a>
                  );
                })}

                {time && <time className="message-time">{time}</time>}

                {textParts && (
                  <button
                    type="button"
                    className="message-copy-button"
                    aria-label={language === "ar" ? "نسخ الرسالة" : "Copy message"}
                    onClick={() => {
                      navigator.clipboard.writeText(textParts).then(() => {
                        setCopiedMessageId(event.id);
                        setTimeout(() => setCopiedMessageId(null), 1500);
                      });
                    }}
                  >
                    {copiedMessageId === event.id ? (
                      <>
                        <FaCheck />
                        {language === "ar" ? "اتنسخت" : "Copied"}
                      </>
                    ) : (
                      <FaCopy />
                    )}
                  </button>
                )}
              </article>
            </Fragment>
          );
        })}

        <div ref={messagesEndRef} />
      </section>

      {!isNearBottom && (
        <button
          type="button"
          className="chat-scroll-to-bottom"
          onClick={() => {
            setIsNearBottom(true);
            messagesEndRef.current?.scrollIntoView({ block: "end" });
          }}
          aria-label={language === "ar" ? "الرجوع لآخر رسالة" : "Jump to latest"}
        >
          <FaChevronDown />
        </button>
      )}

      <form
        ref={composerRef}
        className="composer"
        onSubmit={async (event) => {
          event.preventDefault();
          const images = pendingImages;
          setPendingImages([]);
          setIsNearBottom(true);
          await sendMessage(images.length > 0 ? images : undefined);
        }}
      >
        {sendError && (
          <div className="composer-error">
            {language === "ar" ? "فشل الإرسال: " : "Send failed: "}
            {sendError}
          </div>
        )}
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

      {openReportText && (
        <div className="modal-backdrop" onClick={() => setOpenReportText(null)}>
          <div className="modal report-popup" onClick={(e) => e.stopPropagation()}>
            <h2>{language === "ar" ? "التقرير" : "Report"}</h2>
            <div className="message-markdown">
              <ReactMarkdown>{openReportText}</ReactMarkdown>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setOpenReportText(null)}>
                {language === "ar" ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
