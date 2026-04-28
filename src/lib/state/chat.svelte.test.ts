import { describe, expect, it } from "vitest";
import { toMessageViewList } from "../messages";

describe("toMessageViewList", () => {
  it("extracts text/reasoning/tool parts from raw messages", () => {
    const raw = [
      {
        info: { id: "m1", role: "user" },
        parts: [{ type: "text", text: "hello" }],
      },
      {
        info: { id: "m2", role: "assistant" },
        parts: [
          { type: "text", text: "hi " },
          { type: "text", text: "there" },
          { type: "reasoning", text: "thinking..." },
          {
            type: "tool",
            callID: "c1",
            tool: "shell",
            state: { status: "completed", input: { cmd: "ls" }, output: "a\nb" },
          },
        ],
      },
    ];

    const result = toMessageViewList(raw);

    expect(result).toEqual([
      { id: "m1", role: "user", text: "hello", reasoning: "", toolCalls: [] },
      {
        id: "m2",
        role: "assistant",
        text: "hi there",
        reasoning: "thinking...",
        toolCalls: [
          {
            id: "c1",
            name: "shell",
            status: "completed",
            input: JSON.stringify({ cmd: "ls" }),
            output: "a\nb",
            error: undefined,
          },
        ],
      },
    ]);
  });

  it("drops empty assistant messages with no parts", () => {
    expect(toMessageViewList([{ info: { id: "m1", role: "assistant" }, parts: [] }])).toEqual([]);
  });

  it("ignores non-object entries and unknown roles", () => {
    expect(toMessageViewList([null, "x", { info: { role: "tool" } }])).toEqual([]);
  });
});
