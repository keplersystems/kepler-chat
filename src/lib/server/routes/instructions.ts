import { Elysia, t } from "elysia";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { requireAuth } from "$lib/server/auth";
import { getSessionsRoot } from "$lib/server/paths";

function instructionsPath(): string {
  return resolve(getSessionsRoot(), "AGENTS.md");
}

export const instructionsRoute = new Elysia({ prefix: "/api/instructions" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      const content = await readFile(instructionsPath(), "utf8").catch((err) => {
        if (err.code === "ENOENT") return "";
        throw err;
      });
      return { content };
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
      body: t.Object({ content: t.String({ maxLength: 65536 }) }),
      detail: {
        summary: "Update global instructions",
        tags: ["Settings"],
        description: "Overwrite the sessions-root AGENTS.md",
      },
    },
  );
