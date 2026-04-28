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

function extractTokens(raw: unknown): MessageTokens | undefined {
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

      const text = (m.parts ?? [])
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      const reasoning = (m.parts ?? [])
        .filter((p) => p?.type === "reasoning" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      const toolCalls = (m.parts ?? [])
        .filter((p) => p?.type === "tool")
        .map((p, i): ToolCallView => {
          const t = p as {
            id?: string;
            callID?: string;
            tool?: string;
            state?: {
              status?: ToolCallView["status"];
              input?: unknown;
              output?: string;
              error?: string;
            };
          };
          return {
            id: t.callID ?? t.id ?? `tool-${id}-${i}`,
            name: t.tool ?? "tool",
            status: t.state?.status ?? "running",
            input: t.state?.input !== undefined ? JSON.stringify(t.state.input) : undefined,
            output: t.state?.output,
            error: t.state?.error,
          };
        });

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

export function isTerminalFinish(finish?: string): boolean {
  return (
    typeof finish === "string" &&
    finish.length > 0 &&
    !["tool-calls", "unknown"].includes(finish)
  );
}
