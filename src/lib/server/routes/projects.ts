import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import {
  createProject,
  deleteProject,
  getProjectInstructions,
  listProjects,
  renameProject,
  requireProject,
  setProjectInstructions,
} from "$lib/server/projects";

export const projectsRoute = new Elysia({ prefix: "/api/projects" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return listProjects();
    },
    {
      detail: {
        summary: "List projects",
        tags: ["Projects"],
        description: "Get all projects",
      },
    },
  )
  .post(
    "/",
    async (context) => {
      requireAuth(context);
      return createProject(context.body.name);
    },
    {
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 255 }) }),
      detail: {
        summary: "Create project",
        tags: ["Projects"],
        description: "Create a project with its own directory for instructions, config, and skills",
      },
    },
  )
  .get(
    "/:id",
    async (context) => {
      requireAuth(context);
      const row = await requireProject(context.params.id);
      const instructions = await getProjectInstructions(context.params.id);
      return { ...row, instructions };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get project",
        tags: ["Projects"],
        description: "Get a project with its instructions (AGENTS.md)",
      },
    },
  )
  .patch(
    "/:id",
    async (context) => {
      requireAuth(context);
      return renameProject(context.params.id, context.body.name);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ name: t.String({ minLength: 1, maxLength: 255 }) }),
      detail: {
        summary: "Rename project",
        tags: ["Projects"],
        description: "Rename a project",
      },
    },
  )
  .put(
    "/:id/instructions",
    async (context) => {
      requireAuth(context);
      await requireProject(context.params.id);
      await setProjectInstructions(context.params.id, context.body.content);
      return { success: true as const };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ content: t.String({ maxLength: 65536 }) }),
      detail: {
        summary: "Set project instructions",
        tags: ["Projects"],
        description:
          "Write the project's AGENTS.md; applies to every conversation in the project",
      },
    },
  )
  .delete(
    "/:id",
    async (context) => {
      requireAuth(context);
      await deleteProject(context.params.id);
      return { success: true as const };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete project",
        tags: ["Projects"],
        description: "Delete a project, its conversations, sessions, and files",
      },
    },
  );
