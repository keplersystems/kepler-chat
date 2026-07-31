import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import {
  listPendingRequests,
  replyElicitation,
  replyPermission,
} from "$lib/server/engine/core/requests";

export const requestsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/requests",
    async (context) => {
      requireAuth(context);
      await requireConversation(context.params.id);
      return { requests: listPendingRequests(context.params.id) };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "List pending requests",
        tags: ["Requests"],
        description: "Get pending permission and elicitation requests for a conversation",
      },
    },
  )
  .post(
    "/:id/requests/:requestId/permission",
    async (context) => {
      requireAuth(context);
      replyPermission(context.params.id, context.params.requestId, context.body.optionId);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String(), requestId: t.String() }),
      body: t.Object({ optionId: t.String({ minLength: 1 }) }),
      detail: {
        summary: "Reply to permission request",
        tags: ["Requests"],
        description: "Select an option on a pending permission request",
      },
    },
  )
  .post(
    "/:id/requests/:requestId/elicitation",
    async (context) => {
      requireAuth(context);
      const { action, content } = context.body;
      replyElicitation(
        context.params.id,
        context.params.requestId,
        action === "accept" ? { action, content: content ?? {} } : { action },
      );
      return { success: true };
    },
    {
      params: t.Object({ id: t.String(), requestId: t.String() }),
      body: t.Object({
        action: t.UnionEnum(["accept", "decline", "cancel"]),
        content: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
      detail: {
        summary: "Reply to elicitation request",
        tags: ["Requests"],
        description: "Answer, decline, or cancel a pending elicitation form",
      },
    },
  );
