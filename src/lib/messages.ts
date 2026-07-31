import type { MessageView, PartView } from "$lib/contracts";

const NORMAL_FINISH = new Set(["end_turn", "cancelled"]);

/** Truncation, refusal, or limit stops warrant a visible badge. */
export function isAbnormalFinish(stopReason?: string): boolean {
  return typeof stopReason === "string" && stopReason.length > 0 && !NORMAL_FINISH.has(stopReason);
}

export function hasVisibleContent(view: MessageView): boolean {
  const hasRenderableParts = view.parts.some(
    (part) => (part.type !== "text" && part.type !== "reasoning") || part.text.trim().length > 0,
  );
  return hasRenderableParts || view.error !== undefined;
}

export function messageText(view: MessageView): string {
  return view.parts
    .filter((part): part is Extract<PartView, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

export function toMessageViewList(messages: MessageView[]): MessageView[] {
  return messages.filter((view) => view.role === "user" || hasVisibleContent(view));
}
