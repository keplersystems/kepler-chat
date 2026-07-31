import { STREAM_EVENT_NAMES, type SSEEnvelope, type StreamEventName } from "$lib/contracts";

const EVENT_NAMES = new Set<string>(STREAM_EVENT_NAMES);

function parseEnvelope(id: string, event: string, dataLines: string[]): SSEEnvelope {
  const dataRaw = dataLines.join("\n");

  if (event === "error" || !EVENT_NAMES.has(event)) {
    try {
      const parsed = JSON.parse(dataRaw) as { message?: unknown };
      const message =
        typeof parsed.message === "string" && parsed.message.length > 0
          ? parsed.message
          : dataRaw || "Unknown stream event";
      return { id, event: "error", data: { message } };
    } catch {
      return { id, event: "error", data: { message: dataRaw || "Unknown stream event" } };
    }
  }

  try {
    return { id, event: event as StreamEventName, data: JSON.parse(dataRaw) } as SSEEnvelope;
  } catch {
    return { id, event: "error", data: { message: `Invalid SSE JSON for event ${event}` } };
  }
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEnvelope> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const splitIndex = buffer.indexOf("\n\n");
      if (splitIndex === -1) break;

      const rawMessage = buffer.slice(0, splitIndex);
      buffer = buffer.slice(splitIndex + 2);

      const lines = rawMessage.split("\n");
      let id = "";
      let event = "";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("id:")) id = line.slice(3).trim();
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }

      if (!id || dataLines.length === 0) continue;
      yield parseEnvelope(id, event, dataLines);
    }
  }
}
