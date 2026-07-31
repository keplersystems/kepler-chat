import { Elysia, t } from "elysia";
import { SKILL_NAME_PATTERN } from "$lib/contracts";
import { INSTRUCTIONS_MAX_LENGTH } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { requireProject } from "$lib/server/projects";
import {
  deleteSkill,
  listSkills,
  
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
      return { skills: await listSkills(context.query.projectId ?? null) };
    },
    {
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "List skills",
        tags: ["Skills"],
        description:
          "List skills as agents discover them (global, plus a project's own when projectId is given)",
      },
    },
  )
  .put(
    "/:name",
    async (context) => {
      requireAuth(context);
      if (context.body.projectId) await requireProject(context.body.projectId);
      await upsertSkill(
        context.params.name,
        context.body.projectId ?? null,
        context.body.description,
        context.body.content,
      );
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
        description: "Write the skill's SKILL.md and resync conversation workspaces",
      },
    },
  )
  .delete(
    "/:name",
    async (context) => {
      requireAuth(context);
      if (context.query.projectId) await requireProject(context.query.projectId);
      await deleteSkill(context.params.name, context.query.projectId ?? null);
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
