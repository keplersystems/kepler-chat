import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import { opencodeManager } from "../services/opencode";
import { requireAuth } from "../middleware/auth";
import type { PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2";

type PendingRequest =
  | { type: "permission"; request: PermissionRequest }
  | { type: "question"; request: QuestionRequest };

const permissionReplySchema = t.Union([
  t.Literal("once"),
  t.Literal("always"),
  t.Literal("reject"),
]);

export const requestsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/requests",
    async (context) => {
      const userId = await requireAuth(context);
      const { id } = context.params;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, id), eq(fields.user_id, userId)),
      });

      if (!conv) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      const { client } = await opencodeManager.getOrSpawn(userId, id);
      const [{ data: permissions, error: permError }, { data: questions, error: questionError }] =
        await Promise.all([client.permission.list(), client.question.list()]);

      if (permError || !permissions) {
        throw new Error("Failed to fetch permissions");
      }
      if (questionError || !questions) {
        throw new Error("Failed to fetch questions");
      }

      const sessionID = conv.opencode_session_id;
      const requests: PendingRequest[] = [
        ...permissions
          .filter((request) => request.sessionID === sessionID)
          .map((request) => ({ type: "permission" as const, request })),
        ...questions
          .filter((request) => request.sessionID === sessionID)
          .map((request) => ({ type: "question" as const, request })),
      ];

      return { requests };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
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
      const userId = await requireAuth(context);
      const { id, requestId } = context.params;
      const { reply, message } = context.body;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, id), eq(fields.user_id, userId)),
      });

      if (!conv) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      const { client } = await opencodeManager.getOrSpawn(userId, id);
      const { data: permissions, error: permError } = await client.permission.list();

      if (permError || !permissions) {
        throw new Error("Failed to fetch permissions");
      }

      const match = permissions.find(
        (request) =>
          request.id === requestId &&
          request.sessionID === conv.opencode_session_id,
      );

      if (!match) {
        context.set.status = 404;
        return { error: "Permission request not found" };
      }

      const { data, error } = await client.permission.reply({
        requestID: requestId,
        reply,
        message,
      });

      if (error || !data) {
        throw new Error("Failed to reply to permission");
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
        requestId: t.String(),
      }),
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
      const userId = await requireAuth(context);
      const { id, requestId } = context.params;
      const { answers } = context.body;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, id), eq(fields.user_id, userId)),
      });

      if (!conv) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      const { client } = await opencodeManager.getOrSpawn(userId, id);
      const { data: questions, error: questionError } =
        await client.question.list();

      if (questionError || !questions) {
        throw new Error("Failed to fetch questions");
      }

      const match = questions.find(
        (request) =>
          request.id === requestId &&
          request.sessionID === conv.opencode_session_id,
      );

      if (!match) {
        context.set.status = 404;
        return { error: "Question request not found" };
      }

      const { data, error } = await client.question.reply({
        requestID: requestId,
        answers,
      });

      if (error || !data) {
        throw new Error("Failed to reply to question");
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
        requestId: t.String(),
      }),
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
      const userId = await requireAuth(context);
      const { id, requestId } = context.params;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, id), eq(fields.user_id, userId)),
      });

      if (!conv) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      const { client } = await opencodeManager.getOrSpawn(userId, id);
      const { data: questions, error: questionError } =
        await client.question.list();

      if (questionError || !questions) {
        throw new Error("Failed to fetch questions");
      }

      const match = questions.find(
        (request) =>
          request.id === requestId &&
          request.sessionID === conv.opencode_session_id,
      );

      if (!match) {
        context.set.status = 404;
        return { error: "Question request not found" };
      }

      const { data, error } = await client.question.reject({
        requestID: requestId,
      });

      if (error || !data) {
        throw new Error("Failed to reject question");
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
        requestId: t.String(),
      }),
      detail: {
        summary: "Reject question request",
        tags: ["Requests"],
        description: "Reject a pending question request for a conversation",
      },
    },
  );
