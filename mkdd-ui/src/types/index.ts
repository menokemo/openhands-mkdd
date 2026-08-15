export type Workspace = {
  id: string;
  name: string;
  path: string;
  color?: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  agent_kind: string;
  llm_profile_ref: string;
  displayNameEn: string | null;
  displayNameAr: string | null;
  role: string | null;
  avatarUrl: string | null;
  order?: number;
};

export type ConversationExecutionStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting_for_confirmation"
  | "finished"
  | "error"
  | "stuck"
  | "deleting";

export type MessageContentItem =
  { type: "text"; text: string } | { type: "image"; image_urls: string[] };

export type ConversationEventBase = {
  id: string;
  kind: string;
  source: string;
  timestamp?: string;
};

export type ChatMessage = ConversationEventBase & {
  kind: "MessageEvent";
  llm_message: {
    content: MessageContentItem[];
  };
};

export type ActionActivityEvent = ConversationEventBase & {
  kind: "ActionEvent";
  summary?: string;
  tool_name?: string;
};

export type WorkPlanTaskStatus = "todo" | "in_progress" | "done";

export type WorkPlanTask = {
  title: string;
  notes: string;
  status: WorkPlanTaskStatus;
};

export type TaskTrackerObservation = {
  command: "view" | "plan";
  task_list: WorkPlanTask[];
};

export type ObservationActivityEvent = ConversationEventBase & {
  kind: "ObservationEvent";
  action_id?: string;
  tool_name?: string;
  content: MessageContentItem[];
  is_error: boolean;
  task_tracker?: TaskTrackerObservation;
};

export type AgentErrorActivityEvent = ConversationEventBase & {
  kind: "AgentErrorEvent";
  error?: string;
  tool_name?: string;
};

export type PauseActivityEvent = ConversationEventBase & {
  kind: "PauseEvent";
};

export type InterruptActivityEvent = ConversationEventBase & {
  kind: "InterruptEvent";
};

export type RejectActivityEvent = ConversationEventBase & {
  kind: "UserRejectObservation";
  rejection_reason?: string;
  rejection_source?: "user" | "hook";
  action_id?: string;
  tool_name?: string;
};

export type HookActivityEvent = ConversationEventBase & {
  kind: "HookExecutionEvent";
  hook_event_type?: string;
  tool_name?: string;
  success?: boolean;
  blocked?: boolean;
  exit_code?: number;
  reason?: string;
  error?: string;
};

export type ActivityEvent =
  | ActionActivityEvent
  | ObservationActivityEvent
  | AgentErrorActivityEvent
  | PauseActivityEvent
  | InterruptActivityEvent
  | RejectActivityEvent
  | HookActivityEvent;

export type ConversationEvent = ChatMessage | ActivityEvent;

export type ConversationCost = {
  modelName: string | null;
  accumulatedCost: number;
  tokens: {
    prompt: number;
    completion: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning: number;
  } | null;
};

export type Conversation = {
  id: string;
  execution_status?: ConversationExecutionStatus;
  cost?: ConversationCost | null;
  tags?: {
    mkddproject?: string;
    mkddemployee?: string;
    [key: string]: unknown;
  };
};

export type ConversationResponse = {
  conversation: Conversation | null;
};

export type WorkPlan = {
  tasks: WorkPlanTask[];
  counts: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
  };
  progressPercent: number;
};

export type EventsResponse = {
  items?: ConversationEvent[];
  next_page_id?: string | null;
  work_plan: WorkPlan | null;
};

export type SendMessageResponse = {
  conversation?: Conversation;
  conversation_id?: string;
  result?: unknown;
};
