import { Elysia, t } from "elysia";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import {
  rejectQuestion as rejectQuestionService,
  replyPermission as replyPermissionService,
  replyQuestion as replyQuestionService,
} from "$lib/server/requests";
import type { PendingRequestDTO } from "$lib/contracts";

const permissionReplySchema = t.Union([
  t.Literal("once"),
  t.Literal("always"),
  t.Literal("reject"),
]);

export const requestsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/requests",
    async (context) => {
      requireAuth(context);
      const { id } = context.params;

      const conv = await requireConversation(id);

      const { client } = await opencodeServer.conversationClient(conv);
      const [{ data: permissions, error: permError }, { data: questions, error: questionError }] =
        await Promise.all([client.permission.list(), client.question.list()]);

      if (permError || !permissions) throw new Error("Failed to fetch permissions");
      if (questionError || !questions) throw new Error("Failed to fetch questions");

      const sessionID = conv.opencode_session_id;
      const requests: PendingRequestDTO[] = [
        ...permissions
          .filter((r) => r.sessionID === sessionID)
          .map((r) => ({ type: "permission" as const, request: r })),
        ...questions
          .filter((r) => r.sessionID === sessionID)
          .map((r) => ({ type: "question" as const, request: r })),
      ];

      return { requests };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "List pending requests",
        tags: ["Requests"],
        description: "Get pending permission and question requests for a conversation",
      },
    },
  )
  .post(
    "/:id/permissions/:requestId/reply",
    async (context) => {
      requireAuth(context);
      const { id, requestId } = context.params;
      await replyPermissionService(id, requestId, context.body.reply, context.body.message);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String(), requestId: t.String() }),
      body: t.Object({
        reply: permissionReplySchema,
        message: t.Optional(t.String({ minLength: 1 })),
      }),
      detail: {
        summary: "Reply to permission request",
        tags: ["Requests"],
        description: "Reply to a pending permission request for a conversation",
      },
    },
  )
  .post(
    "/:id/questions/:requestId/reply",
    async (context) => {
      requireAuth(context);
      const { id, requestId } = context.params;
      await replyQuestionService(id, requestId, context.body.answers);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String(), requestId: t.String() }),
      body: t.Object({
        answers: t.Array(
          t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
          { minItems: 1 },
        ),
      }),
      detail: {
        summary: "Reply to question request",
        tags: ["Requests"],
        description: "Reply to a pending question request for a conversation",
      },
    },
  )
  .post(
    "/:id/questions/:requestId/reject",
    async (context) => {
      requireAuth(context);
      const { id, requestId } = context.params;
      await rejectQuestionService(id, requestId);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String(), requestId: t.String() }),
      detail: {
        summary: "Reject question request",
        tags: ["Requests"],
        description: "Reject a pending question request for a conversation",
      },
    },
  );
