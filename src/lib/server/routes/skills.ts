import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireProject } from "$lib/server/projects";
import { deleteSkill, listSkills, upsertSkill } from "$lib/server/skills";
import type { ConfigScope } from "$lib/server/opencode/config-file";

const skillNameSchema = t.RegExp(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
  description: "Skill name (lowercase kebab-case)",
});

async function resolveScope(projectId: string | undefined): Promise<ConfigScope> {
  if (!projectId) return { kind: "global" };
  await requireProject(projectId);
  return { kind: "project", projectId };
}

export const skillsRoute = new Elysia({ prefix: "/api/skills" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      if (context.query.projectId) await requireProject(context.query.projectId);
      const skills = await listSkills(context.query.projectId);
      return { skills };
    },
    {
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "List skills",
        tags: ["Skills"],
        description:
          "List skills as OpenCode discovers them (global, plus a project's own when projectId is given)",
      },
    },
  )
  .put(
    "/:name",
    async (context) => {
      requireAuth(context);
      const scope = await resolveScope(context.body.projectId);
      await upsertSkill(scope, context.params.name, context.body.description, context.body.content);
      return { success: true as const };
    },
    {
      params: t.Object({ name: skillNameSchema }),
      body: t.Object({
        projectId: t.Optional(t.String({ minLength: 1 })),
        description: t.String({ minLength: 1, maxLength: 1024 }),
        content: t.String({ minLength: 1, maxLength: 65536 }),
      }),
      detail: {
        summary: "Create or update skill",
        tags: ["Skills"],
        description: "Write the skill's SKILL.md and reload affected OpenCode instances",
      },
    },
  )
  .delete(
    "/:name",
    async (context) => {
      requireAuth(context);
      const scope = await resolveScope(context.query.projectId);
      await deleteSkill(scope, context.params.name);
      return { success: true as const };
    },
    {
      params: t.Object({ name: skillNameSchema }),
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "Delete skill",
        tags: ["Skills"],
        description: "Delete the skill directory from its scope",
      },
    },
  );
