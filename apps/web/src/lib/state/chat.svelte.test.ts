import { describe, expect, it } from "vitest";
import { appendDeltaToMessage, resetConversationRuntimeState, upsertMessageList } from "./chat-reducer";
import type { MessageView } from "./chat-types";

describe("chat state reducer", () => {
  it("upserts and appends deltas deterministically", () => {
    const initial: MessageView = {
      id: "m1",
      role: "assistant",
      text: "hello",
    };

    const upserted = upsertMessageList([], initial);
    const withDelta = appendDeltaToMessage(upserted, "m1", " world");

    expect(withDelta).toEqual([
      {
        id: "m1",
        role: "assistant",
        text: "hello world",
      },
    ]);

    const overwritten = upsertMessageList(withDelta, {
      id: "m1",
      role: "assistant",
      text: "overwritten",
    });

    expect(overwritten?.[0]?.text).toBe("overwritten");
  });

  it("tracks requests, streaming state, and errors", () => {
    const reset = resetConversationRuntimeState();
    expect(reset.pendingRequests).toEqual([]);
    expect(reset.isStreaming).toBe(false);
    expect(reset.lastError).toBeNull();
  });
});
