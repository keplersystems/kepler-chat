import { describe, expect, it } from "vitest";
import type { AssistantMessage, Part, TextPart, UserMessage } from "@opencode-ai/sdk/v2";
import { messageText, toMessageViewList } from "../messages";

function userMessage(id: string): UserMessage {
  return {
    id,
    sessionID: "s1",
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-sonnet-5" },
  };
}

function assistantMessage(id: string, overrides?: Partial<AssistantMessage>): AssistantMessage {
  return {
    id,
    sessionID: "s1",
    role: "assistant",
    time: { created: 2 },
    parentID: "m1",
    modelID: "claude-sonnet-5",
    providerID: "anthropic",
    mode: "build",
    agent: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
  };
}

function textPart(id: string, messageID: string, text: string): TextPart {
  return { id, sessionID: "s1", messageID, type: "text", text };
}

describe("toMessageViewList", () => {
  it("keeps parts ordered and maps tool state", () => {
    const parts: Part[] = [
      {
        id: "p1",
        sessionID: "s1",
        messageID: "m2",
        type: "reasoning",
        text: "thinking...",
        time: { start: 1 },
      },
      {
        id: "p2",
        sessionID: "s1",
        messageID: "m2",
        type: "tool",
        callID: "c1",
        tool: "shell",
        state: {
          status: "completed",
          input: { cmd: "ls" },
          output: "a\nb",
          title: "ls",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      },
      textPart("p3", "m2", "done"),
    ];

    const result = toMessageViewList([
      { info: userMessage("m1"), parts: [textPart("p0", "m1", "hello")] },
      { info: assistantMessage("m2", { finish: "stop" }), parts },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[0].parts).toEqual([{ type: "text", id: "p0", text: "hello" }]);
    expect(result[1].parts.map((p) => p.type)).toEqual(["reasoning", "tool", "text"]);
    expect(result[1].tokens).toEqual({
      input: 10,
      output: 5,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 15,
    });
    expect(result[1].finish).toBe("stop");
  });

  it("drops assistant messages without visible content", () => {
    const result = toMessageViewList([
      { info: assistantMessage("m1"), parts: [] },
      { info: assistantMessage("m2"), parts: [textPart("p1", "m2", "  ")] },
    ]);
    expect(result).toEqual([]);
  });

  it("hides synthetic and ignored text parts", () => {
    const synthetic: Part = { ...textPart("p1", "m1", "injected"), synthetic: true };
    const ignored: Part = { ...textPart("p2", "m1", "hidden"), ignored: true };
    const result = toMessageViewList([
      { info: assistantMessage("m1"), parts: [synthetic, ignored, textPart("p3", "m1", "shown")] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].parts).toEqual([{ type: "text", id: "p3", text: "shown" }]);
  });

  it("surfaces assistant errors even without parts", () => {
    const result = toMessageViewList([
      {
        info: assistantMessage("m1", {
          error: { name: "UnknownError", data: { message: "boom" } },
        }),
        parts: [],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].error).toBe("boom");
  });
});

describe("messageText", () => {
  it("joins text parts only", () => {
    const [view] = toMessageViewList([
      {
        info: assistantMessage("m1"),
        parts: [
          textPart("p1", "m1", "one"),
          {
            id: "p2",
            sessionID: "s1",
            messageID: "m1",
            type: "reasoning",
            text: "skip",
            time: { start: 1 },
          },
          textPart("p3", "m1", "two"),
        ],
      },
    ]);
    expect(messageText(view)).toBe("one\n\ntwo");
  });
});
