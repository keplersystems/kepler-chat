import { Elysia, t } from "elysia";
import { INSTRUCTIONS_MAX_LENGTH } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { requireProject, resolveConfigScope } from "$lib/server/projects";
import {
  deleteSkill,
  listSkills,
  SKILL_NAME_PATTERN,
  upsertSkill,
} from "$lib/server/skills";

const skillNameSchema = t.RegExp(SKILL_NAME_PATTERN, {
  description: "Skill name (lowercase kebab-case)",
});

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
      const scope = await resolveConfigScope(context.body.projectId);
      await upsertSkill(scope, context.params.name, context.body.description, context.body.content);
      return { success: true as const };
    },
    {
      params: t.Object({ name: skillNameSchema }),
      body: t.Object({
        projectId: t.Optional(t.String({ minLength: 1 })),
        description: t.String({ minLength: 1, maxLength: 1024 }),
        content: t.String({ minLength: 1, maxLength: INSTRUCTIONS_MAX_LENGTH }),
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
      const scope = await resolveConfigScope(context.query.projectId);
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
