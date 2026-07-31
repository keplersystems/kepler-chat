import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import { driverFor } from "$lib/server/engine/registry";
import { sendCommandStream } from "$lib/server/engine/core/turn-runner";

export const commandsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/commands",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const driver = driverFor(conv.agent_id);
      await driver.ensureSession(conv);
      return { commands: await driver.listCommands(conv) };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "List agent commands",
        tags: ["Commands"],
        description: "Slash commands the agent advertises for this conversation's session",
      },
    },
  )
  .post(
    "/:id/commands",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      return sendCommandStream(conv, context.body, context.request.signal);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.String({ minLength: 1 }),
        args: t.Optional(t.String()),
      }),
      detail: {
        summary: "Run agent command",
        tags: ["Commands"],
        description: "Run a slash command as a prompt turn and stream the response via SSE",
        responses: {
          200: {
            description: "SSE stream of message events",
            content: {
              "text/event-stream": {
                schema: {
                  type: "object",
                  description: "Kepler stream events (message, part, delta, usage, turn.end, ...)",
                },
              },
            },
          },
        },
      },
    },
  );
