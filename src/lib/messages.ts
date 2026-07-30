// View model for chat messages. Parts stay ordered exactly as OpenCode
// produced them, so text/tool/reasoning interleaving renders faithfully.

import type {
  AssistantMessage,
  Message,
  Part,
  ToolState,
} from "@opencode-ai/sdk/v2";

export type PartView =
  | { type: "text"; id: string; text: string }
  | { type: "reasoning"; id: string; text: string }
  | { type: "tool"; id: string; callID: string; name: string; state: ToolState }
  | { type: "file"; id: string; mime: string; filename?: string; url: string }
  | { type: "subtask"; id: string; agent: string; description: string }
  | { type: "command"; id: string; name: string; args: string }
  | { type: "retry"; id: string; attempt: number; message: string };

export interface MessageTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface MessageView {
  id: string;
  role: "user" | "assistant";
  parts: PartView[];
  finish?: string;
  error?: string;
  modelID?: string;
  providerID?: string;
  tokens?: MessageTokens;
  cost?: number;
  createdAt?: number;
}

export function extractTokens(
  tokens: AssistantMessage["tokens"],
): MessageTokens {
  return {
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cacheRead: tokens.cache.read,
    cacheWrite: tokens.cache.write,
    total: tokens.total ?? tokens.input + tokens.output,
  };
}

/** Map an OpenCode part to its renderable view, or null for non-visual parts. */
export function toPartView(part: Part): PartView | null {
  switch (part.type) {
    case "text":
      if (part.synthetic || part.ignored) return null;
      return { type: "text", id: part.id, text: part.text };
    case "reasoning":
      return { type: "reasoning", id: part.id, text: part.text };
    case "tool":
      return {
        type: "tool",
        id: part.id,
        callID: part.callID,
        name: part.tool,
        state: part.state,
      };
    case "file":
      return {
        type: "file",
        id: part.id,
        mime: part.mime,
        filename: part.filename,
        url: part.url,
      };
    case "subtask":
      return {
        type: "subtask",
        id: part.id,
        agent: part.agent,
        description: part.description,
      };
    case "retry":
      return {
        type: "retry",
        id: part.id,
        attempt: part.attempt,
        message: part.error.data.message,
      };
    default:
      return null;
  }
}

function extractErrorMessage(error: AssistantMessage["error"]): string | undefined {
  if (!error) return undefined;
  const message = (error.data as { message?: unknown }).message;
  return typeof message === "string" ? message : error.name;
}

/** Apply message-level metadata from an OpenCode message onto a view. */
export function applyMessageInfo(view: MessageView, info: Message): void {
  view.role = info.role;
  view.createdAt = info.time.created;
  if (info.role === "assistant") {
    view.finish = info.finish;
    view.modelID = info.modelID;
    view.providerID = info.providerID;
    view.tokens = extractTokens(info.tokens);
    view.cost = info.cost;
    view.error = extractErrorMessage(info.error);
  } else {
    view.modelID = info.model.modelID;
    view.providerID = info.model.providerID;
  }
}

/** Concatenated text content, used for copy-to-clipboard. */
/**
 * Rebuild a send-API attachment from a persisted user file part. Uploads live
 * under the conversation's input/ dir (see paths.ts) and the API takes paths
 * relative to it; parts whose URL is elsewhere (e.g. generated output files)
 * return null.
 */
export function fileAttachmentInput(
  part: Extract<PartView, { type: "file" }>,
): { path: string; mimeType?: string; filename?: string } | null {
  if (!part.url.startsWith("file://")) return null;
  const pathname = decodeURIComponent(new URL(part.url).pathname);
  const marker = "/input/";
  const index = pathname.lastIndexOf(marker);
  if (index === -1) return null;
  return {
    path: pathname.slice(index + marker.length),
    mimeType: part.mime,
    filename: part.filename,
  };
}

export function messageText(view: MessageView): string {
  return view.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
}

/** OpenCode's placeholder session titles ("New session - <iso>") are never displayed. */
const DEFAULT_SESSION_TITLE =
  /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isRealSessionTitle(title: string | undefined): title is string {
  return !!title && !DEFAULT_SESSION_TITLE.test(title);
}

const NORMAL_FINISH = new Set(["stop", "tool-calls", "tool_calls", "unknown"]);

/** True when the finish reason indicates something abnormal (truncation, filter, error). */
export function isAbnormalFinish(finish?: string): boolean {
  return typeof finish === "string" && finish.length > 0 && !NORMAL_FINISH.has(finish);
}

/**
 * True when the message has reached a terminal state worth flushing to the UI.
 * Used by the streaming reducer to decide when to emit an in-progress assistant
 * message even if it has no body yet.
 */
export function isTerminalFinish(finish?: string): boolean {
  return (
    typeof finish === "string" &&
    finish.length > 0 &&
    !["tool-calls", "unknown"].includes(finish)
  );
}

export function hasVisibleContent(view: MessageView): boolean {
  const hasRenderableParts = view.parts.some(
    (p) => p.type !== "text" || p.text.trim().length > 0,
  );
  return hasRenderableParts || view.error !== undefined || isTerminalFinish(view.finish);
}

export function toMessageViewList(
  entries: Array<{ info: Message; parts: Part[] }>,
): MessageView[] {
  return entries
    .map(({ info, parts }) => {
      const view: MessageView = {
        id: info.id,
        role: info.role,
        parts: parts.map(toPartView).filter((p): p is PartView => p !== null),
      };
      applyMessageInfo(view, info);
      return view;
    })
    .filter((view) => view.role === "user" || hasVisibleContent(view));
}
