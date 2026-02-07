export interface ToolCallView {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error" | "executed";
  input?: string;
  output?: string;
  error?: string;
}

export interface MessageView {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  reasoning?: string;
  toolCalls?: ToolCallView[];
  finish?: string;
}
