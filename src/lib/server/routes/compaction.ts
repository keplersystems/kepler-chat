import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { readOpencodeConfig, updateOpencodeConfig } from "$lib/server/opencode/config-file";
import { opencodeServer } from "$lib/server/opencode/supervisor";

export const compactionRoute = new Elysia({ prefix: "/api/compaction" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      const config = await readOpencodeConfig({ kind: "global" });
      return { auto: config.compaction?.auto ?? true };
    },
    {
      detail: {
        summary: "Get compaction config",
        tags: ["Settings"],
        description: "Whether OpenCode auto-compacts when the context window fills",
      },
    },
  )
  .put(
    "/",
    async (context) => {
      requireAuth(context);
      await updateOpencodeConfig({ kind: "global" }, (config) => {
        config.compaction = { ...config.compaction, auto: context.body.auto };
      });
      // Global config is cached process-wide in OpenCode; restart to apply.
      await opencodeServer.restart();
      return { success: true };
    },
    {
      body: t.Object({ auto: t.Boolean() }),
      detail: {
        summary: "Update compaction config",
        tags: ["Settings"],
        description: "Toggle OpenCode auto-compaction and restart the server",
      },
    },
  );
