import { describe, expect, it } from "vitest";
import { streamMessage } from "./chat";

function toEvent(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamFromText(body: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe("streamMessage", () => {
  it("normalizes assistant events into MessageView updates", async () => {
    const sse = [
      toEvent("1", "message.updated", {
        info: { id: "user-1", role: "user" },
      }),
      toEvent("2", "message.part.updated", {
        part: { messageID: "user-1", type: "text", text: "hi" },
      }),
      toEvent("3", "message.updated", {
        info: { id: "asst-1", role: "assistant" },
      }),
      toEvent("4", "message.part.updated", {
        part: { messageID: "asst-1", type: "text", text: "Hello from assistant" },
      }),
    ].join("");

    const onMessageCalls: Array<{ id: string; role: string; text: string }> = [];

    await streamMessage(
      "conv-1",
      { text: "hi" },
      {
        onMessage: (msg) => {
          onMessageCalls.push(msg as { id: string; role: string; text: string });
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onMessageCalls.some((msg) => msg.id === "user-1")).toBe(false);
    expect(onMessageCalls.at(-1)).toMatchObject({
      id: "asst-1",
      role: "assistant",
      text: "Hello from assistant",
    });
  });

  it("accumulates text deltas for assistant parts", async () => {
    const sse = [
      toEvent("1", "message.updated", {
        info: { id: "asst-2", role: "assistant" },
      }),
      toEvent("2", "message.part.updated", {
        delta: "Hel",
        part: { messageID: "asst-2", type: "text" },
      }),
      toEvent("3", "message.part.updated", {
        delta: "lo",
        part: { messageID: "asst-2", type: "text" },
      }),
    ].join("");

    const onMessageCalls: Array<{ id: string; text: string }> = [];

    await streamMessage(
      "conv-1",
      { text: "hi" },
      {
        onMessage: (msg) => {
          onMessageCalls.push(msg as { id: string; text: string });
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onMessageCalls.at(-1)).toMatchObject({
      id: "asst-2",
      text: "Hello",
    });
  });

  it("does not classify unknown-role message parts as assistant", async () => {
    const sse = [
      toEvent("1", "message.part.updated", {
        part: { messageID: "user-2", type: "text", text: "9 + 10" },
      }),
      toEvent("2", "message.updated", {
        info: { id: "user-2", role: "user" },
      }),
    ].join("");

    const onMessageCalls: Array<{ id: string; role: string; text: string }> = [];

    await streamMessage(
      "conv-1",
      { text: "9 + 10" },
      {
        onMessage: (msg) => {
          onMessageCalls.push(msg as { id: string; role: string; text: string });
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onMessageCalls).toHaveLength(0);
  });

  it("buffers assistant text parts until assistant role is known", async () => {
    const sse = [
      toEvent("1", "message.part.updated", {
        part: { messageID: "asst-3", type: "text", text: "19" },
      }),
      toEvent("2", "message.updated", {
        info: { id: "asst-3", role: "assistant" },
      }),
    ].join("");

    const onMessageCalls: Array<{ id: string; role: string; text: string }> = [];

    await streamMessage(
      "conv-1",
      { text: "9 + 10" },
      {
        onMessage: (msg) => {
          onMessageCalls.push(msg as { id: string; role: string; text: string });
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onMessageCalls).toHaveLength(1);
    expect(onMessageCalls[0]).toMatchObject({
      id: "asst-3",
      role: "assistant",
      text: "19",
    });
  });

  it("emits generated conversation title from user message summary", async () => {
    const sse = [
      toEvent("1", "message.updated", {
        info: {
          id: "user-3",
          role: "user",
          summary: { title: "Greeting inquiry: how are you?" },
        },
      }),
    ].join("");

    const onTitleCalls: string[] = [];

    await streamMessage(
      "conv-1",
      { text: "how are you?" },
      {
        onTitle: (title) => {
          onTitleCalls.push(title);
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onTitleCalls).toEqual(["Greeting inquiry: how are you?"]);
  });

  it("emits pending permission requests from stream events", async () => {
    const sse = [
      toEvent("1", "permission.asked", {
        id: "per_123",
        sessionID: "ses_1",
        permission: "webfetch",
      }),
    ].join("");

    const onRequestAddedCalls: Array<{ type: string; request: { id: string } }> = [];

    await streamMessage(
      "conv-1",
      { text: "tell me about you" },
      {
        onRequestAdded: (request) => {
          onRequestAddedCalls.push(request as { type: string; request: { id: string } });
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onRequestAddedCalls).toHaveLength(1);
    expect(onRequestAddedCalls[0]).toMatchObject({
      type: "permission",
      request: { id: "per_123" },
    });
  });

  it("does not emit empty assistant placeholder for non-terminal tool-calls finish", async () => {
    const sse = [
      toEvent("1", "message.updated", {
        info: { id: "asst-4", role: "assistant", finish: "tool-calls" },
      }),
    ].join("");

    const onMessageCalls: Array<{ id: string; role: string; text: string; finish?: string }> = [];

    await streamMessage(
      "conv-1",
      { text: "what is opencode" },
      {
        onMessage: (msg) => {
          onMessageCalls.push(
            msg as { id: string; role: string; text: string; finish?: string },
          );
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onMessageCalls).toHaveLength(0);
  });

  it("ignores whitespace-only assistant text updates during tool phase", async () => {
    const sse = [
      toEvent("1", "message.updated", {
        info: { id: "asst-5", role: "assistant", finish: "tool-calls" },
      }),
      toEvent("2", "message.part.updated", {
        delta: "\n",
        part: { messageID: "asst-5", type: "text", text: "\n" },
      }),
      toEvent("3", "message.part.updated", {
        part: { messageID: "asst-5", type: "text", text: "" },
      }),
    ].join("");

    const onMessageCalls: Array<{ id: string; role: string; text: string }> = [];

    await streamMessage(
      "conv-1",
      { text: "what is opencode" },
      {
        onMessage: (msg) => {
          onMessageCalls.push(msg as { id: string; role: string; text: string });
        },
      },
      async () => new Response(streamFromText(sse), { status: 200 }),
    );

    expect(onMessageCalls).toHaveLength(0);
  });
});
