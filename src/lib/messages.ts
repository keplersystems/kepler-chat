export interface ToolCallView {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error" | "executed";
  input?: string;
  output?: string;
  error?: string;
}

export interface MessageTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface MessageView {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  reasoning?: string;
  toolCalls?: ToolCallView[];
  finish?: string;
  modelID?: string;
  providerID?: string;
  tokens?: MessageTokens;
  createdAt?: number;
}

interface RawTokens {
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

interface RawToolPart {
  id?: string;
  callID?: string;
  tool?: string;
  state?: {
    status?: ToolCallView["status"];
    input?: unknown;
    output?: string;
    error?: string;
  };
}

export function extractTokens(raw: unknown): MessageTokens | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const t = raw as RawTokens;
  const input = typeof t.input === "number" ? t.input : undefined;
  const output = typeof t.output === "number" ? t.output : undefined;
  const reasoning = typeof t.reasoning === "number" ? t.reasoning : undefined;
  const cacheRead = typeof t.cache?.read === "number" ? t.cache.read : undefined;
  const cacheWrite = typeof t.cache?.write === "number" ? t.cache.write : undefined;
  const total =
    typeof t.total === "number"
      ? t.total
      : input !== undefined || output !== undefined
        ? (input ?? 0) + (output ?? 0)
        : undefined;
  if (
    input === undefined &&
    output === undefined &&
    reasoning === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined &&
    total === undefined
  ) {
    return undefined;
  }
  return { input, output, reasoning, cacheRead, cacheWrite, total };
}

export function toToolCallView(part: RawToolPart, fallbackId: string): ToolCallView {
  return {
    id: part.callID ?? part.id ?? fallbackId,
    name: part.tool ?? "tool",
    status: part.state?.status ?? "running",
    input: part.state?.input !== undefined ? JSON.stringify(part.state.input) : undefined,
    output: part.state?.output,
    error: part.state?.error,
  };
}

/** Pull a request id out of a permission/question payload. */
export function getRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { id?: unknown; requestID?: unknown; requestId?: unknown };
  if (typeof obj.id === "string" && obj.id.length > 0) return obj.id;
  if (typeof obj.requestID === "string" && obj.requestID.length > 0) return obj.requestID;
  if (typeof obj.requestId === "string" && obj.requestId.length > 0) return obj.requestId;
  return null;
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

export function toMessageViewList(rawMessages: unknown[]): MessageView[] {
  return rawMessages
    .map((raw): MessageView | null => {
      if (!raw || typeof raw !== "object") return null;
      const m = raw as {
        info?: {
          id?: string;
          role?: string;
          modelID?: string;
          providerID?: string;
          tokens?: unknown;
          finish?: string;
          time?: { created?: number };
        };
        parts?: Array<{ type?: string; text?: string }>;
      };
      const id = m.info?.id;
      const role = m.info?.role;
      if (!id || (role !== "user" && role !== "assistant" && role !== "system")) return null;

      const parts = m.parts ?? [];
      const text = parts
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      const reasoning = parts
        .filter((p) => p?.type === "reasoning" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      const toolCalls = parts
        .filter((p) => p?.type === "tool")
        .map((p, i) => toToolCallView(p as RawToolPart, `tool-${id}-${i}`));

      if (
        (role === "assistant" || role === "system") &&
        text.trim().length === 0 &&
        reasoning.trim().length === 0 &&
        toolCalls.length === 0
      ) {
        return null;
      }

      return {
        id,
        role,
        text,
        reasoning,
        toolCalls,
        finish: m.info?.finish,
        modelID: m.info?.modelID,
        providerID: m.info?.providerID,
        tokens: extractTokens(m.info?.tokens),
        createdAt:
          typeof m.info?.time?.created === "number" ? m.info.time.created : undefined,
      };
    })
    .filter((m): m is MessageView => m !== null);
}
