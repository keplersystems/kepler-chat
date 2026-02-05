export type SSEEventName =
  | "message.updated"
  | "message.removed"
  | "message.part.updated"
  | "message.part.delta"
  | "message.part.removed"
  | "permission.asked"
  | "permission.replied"
  | "question.asked"
  | "question.replied"
  | "question.rejected"
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "session.status"
  | "session.idle"
  | "session.compacted"
  | "session.diff"
  | "session.error"
  | "todo.updated"
  | "command.executed"
  | "tui.session.select"
  | "error";

export interface SSEEnvelope<T = unknown> {
  id: string;
  event: SSEEventName;
  data: T;
}

export type SessionScopedEventPayloadMap = {
  "message.updated": unknown;
  "message.removed": unknown;
  "message.part.updated": unknown;
  "message.part.delta": unknown;
  "message.part.removed": unknown;
  "permission.asked": unknown;
  "permission.replied": unknown;
  "question.asked": unknown;
  "question.replied": unknown;
  "question.rejected": unknown;
  "session.created": unknown;
  "session.updated": unknown;
  "session.deleted": unknown;
  "session.status": unknown;
  "session.idle": unknown;
  "session.compacted": unknown;
  "session.diff": unknown;
  "session.error": unknown;
  "todo.updated": unknown;
  "command.executed": unknown;
  "tui.session.select": unknown;
  error: { message: string };
};

export type SessionScopedEventName = keyof SessionScopedEventPayloadMap;
