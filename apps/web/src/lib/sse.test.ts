import { describe, expect, it } from "vitest";
import { parseSSEStream } from "./sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("parseSSEStream", () => {
  it("parses events split across arbitrary chunks", async () => {
    const stream = streamFromChunks([
      'id: 1\nevent: message.part.updated\ndata: {"delta":"hel',
      'lo"}\n\n',
      'id: 2\nevent: message.updated\ndata: {"finish":"stop"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: "1",
      event: "message.part.updated",
      data: { delta: "hello" },
    });
    expect(events[1]).toMatchObject({
      id: "2",
      event: "message.updated",
      data: { finish: "stop" },
    });
  });

  it("emits typed error event when payload is invalid json", async () => {
    const stream = streamFromChunks([
      'id: 3\nevent: message.updated\ndata: {invalid json}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSEStream(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("error");
    expect(events[0]?.data).toMatchObject({
      message: "Invalid SSE JSON for event message.updated",
    });
  });
});
