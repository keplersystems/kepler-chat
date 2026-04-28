import { HttpError } from "$lib/server/http-error";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { requireConversation } from "$lib/server/conversations";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";

interface SessionScopedRequest {
  id: string;
  sessionID: string;
}

async function withRequestMatch<T extends SessionScopedRequest>(
  conversationId: string,
  requestId: string,
  fetchList: (client: OpencodeClient) => Promise<{ data?: T[] | null; error?: unknown }>,
  notFoundMessage: string,
  action: (client: OpencodeClient) => Promise<void>,
): Promise<void> {
  const conv = await requireConversation(conversationId);
  const { client } = await opencodeServer.conversationClient(conversationId);
  const { data, error } = await fetchList(client);
  if (error || !data) throw new Error("Failed to fetch request list");
  const match = data.find(
    (r) => r.id === requestId && r.sessionID === conv.opencode_session_id,
  );
  if (!match) throw new HttpError(404, notFoundMessage);
  await action(client);
}

export async function replyPermission(
  conversationId: string,
  requestId: string,
  reply: "once" | "always" | "reject",
  message?: string,
): Promise<void> {
  await withRequestMatch(
    conversationId,
    requestId,
    (client) => client.permission.list(),
    "Permission request not found",
    async (client) => {
      const { error } = await client.permission.reply({ requestID: requestId, reply, message });
      if (error) throw new Error("Failed to reply to permission");
    },
  );
}

export async function replyQuestion(
  conversationId: string,
  requestId: string,
  answers: string[][],
): Promise<void> {
  await withRequestMatch(
    conversationId,
    requestId,
    (client) => client.question.list(),
    "Question request not found",
    async (client) => {
      const { error } = await client.question.reply({ requestID: requestId, answers });
      if (error) throw new Error("Failed to reply to question");
    },
  );
}

export async function rejectQuestion(
  conversationId: string,
  requestId: string,
): Promise<void> {
  await withRequestMatch(
    conversationId,
    requestId,
    (client) => client.question.list(),
    "Question request not found",
    async (client) => {
      const { error } = await client.question.reject({ requestID: requestId });
      if (error) throw new Error("Failed to reject question");
    },
  );
}
