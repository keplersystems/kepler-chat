import { Elysia, t } from "elysia";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { INSTRUCTIONS_MAX_LENGTH } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { readFileOrEmpty } from "$lib/server/files";
import { getSessionsRoot } from "$lib/server/paths";

function instructionsPath(): string {
  return resolve(getSessionsRoot(), "AGENTS.md");
}

export const instructionsRoute = new Elysia({ prefix: "/api/instructions" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return { content: await readFileOrEmpty(instructionsPath()) };
    },
    {
      detail: {
        summary: "Get global instructions",
        tags: ["Settings"],
        description: "The sessions-root AGENTS.md applied to every conversation",
      },
    },
  )
  .put(
    "/",
    async (context) => {
      requireAuth(context);
      await writeFile(instructionsPath(), context.body.content, "utf8");
      return { success: true };
    },
    {
      body: t.Object({ content: t.String({ maxLength: INSTRUCTIONS_MAX_LENGTH }) }),
      detail: {
        summary: "Update global instructions",
        tags: ["Settings"],
        description: "Overwrite the sessions-root AGENTS.md",
      },
    },
  );
