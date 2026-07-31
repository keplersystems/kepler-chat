import { Elysia, t } from "elysia";
import { INSTRUCTIONS_MAX_LENGTH } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { readGlobalInstructions, writeGlobalInstructions } from "$lib/server/runtime";

export const instructionsRoute = new Elysia({ prefix: "/api/instructions" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return { content: await readGlobalInstructions() };
    },
    {
      detail: {
        summary: "Get global instructions",
        tags: ["Settings"],
        description: "The global instructions merged into every conversation's AGENTS.md",
      },
    },
  )
  .put(
    "/",
    async (context) => {
      requireAuth(context);
      await writeGlobalInstructions(context.body.content);
      return { success: true };
    },
    {
      body: t.Object({ content: t.String({ maxLength: INSTRUCTIONS_MAX_LENGTH }) }),
      detail: {
        summary: "Update global instructions",
        tags: ["Settings"],
        description: "Overwrite the global instructions and resync conversation workspaces",
      },
    },
  );
