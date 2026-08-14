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
  onBack: () => void;
};

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
  onBack,
}: Props) {
  const employeeName =
    language === "ar" ? employee.displayNameAr : employee.displayNameEn;

  return (
    <main className="app project-view chat-screen">
      <header className="chat-screen-header">
        <button className="header-icon-button" onClick={onBack}>
          ←
        </button>

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
      </header>

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
                <div className="agent-message-avatar">
                  {employee.avatarUrl ? (
                    <img src={employee.avatarUrl} alt={employeeName ?? employee.name} />
                  ) : (
                    (employeeName?.slice(0, 1) ?? "?")
                  )}
                </div>
              )}

              <div className="agent-message-body">
                {!isUser && <b>{employeeName}</b>}

                <div className="message-markdown">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>

                {time && <time className="message-time">{time}</time>}
              </div>
            </article>
          );
        })}
      </section>

      <form
        className="composer"
        onSubmit={async (event) => {
          event.preventDefault();
          await sendMessage();
        }}
      >
        <input
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
