import type {
  SSEEnvelope,
  SSEEventName,
  SessionScopedEventPayloadMap,
} from "$lib/contracts";

const EVENT_NAMES = new Set<SSEEventName>([
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.delta",
  "message.part.removed",
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
  "session.created",
  "session.updated",
  "session.deleted",
  "session.status",
  "session.idle",
  "session.compacted",
  "session.diff",
  "session.error",
  "todo.updated",
  "command.executed",
  "tui.session.select",
  "error",
]);

function normalizeEventName(value: string): SSEEventName {
  if (EVENT_NAMES.has(value as SSEEventName)) {
    return value as SSEEventName;
  }
  return "error";
}

function parseEnvelope(
  id: string,
  event: string,
  dataLines: string[],
): SSEEnvelope<SessionScopedEventPayloadMap[keyof SessionScopedEventPayloadMap]> {
  const dataRaw = dataLines.join("\n");
  const eventName = normalizeEventName(event || "error");

  if (eventName === "error") {
    try {
      const parsed = JSON.parse(dataRaw) as { message?: unknown };
      const message =
        typeof parsed.message === "string" && parsed.message.length > 0
          ? parsed.message
          : dataRaw || "Unknown SSE event";
      return { id, event: "error", data: { message } };
    } catch {
      return {
        id,
        event: "error",
        data: { message: dataRaw || "Unknown SSE event" },
      };
    }
  }

  try {
    return {
      id,
      event: eventName,
      data: JSON.parse(dataRaw) as SessionScopedEventPayloadMap[keyof SessionScopedEventPayloadMap],
    };
  } catch {
    return {
      id,
      event: "error",
      data: { message: `Invalid SSE JSON for event ${eventName}` },
    };
  }
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEnvelope<SessionScopedEventPayloadMap[keyof SessionScopedEventPayloadMap]>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const splitIndex = buffer.indexOf("\n\n");
      if (splitIndex === -1) {
        break;
      }

      const rawMessage = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);

      const lines = rawMessage.split("\n");
      let id = "";
      let event = "";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("id:")) {
          id = line.slice(3).trim();
          continue;
        }
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (!id || dataLines.length === 0) {
        continue;
      }

      yield parseEnvelope(id, event, dataLines);
    }
  }
}
