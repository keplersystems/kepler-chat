export interface MessageView {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  finish?: string;
}
