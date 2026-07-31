import { error, fail, redirect } from "@sveltejs/kit";
import { serverApi } from "$lib/api";
import { deleteConversation } from "$lib/server/conversations";
import { deleteProject, renameProject } from "$lib/server/projects";
import { writeProjectInstructions } from "$lib/server/runtime";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params, url }) => {
  const api = serverApi(fetch, url.origin);
  const { data: project } = await api.api.projects({ id: params.id }).get();
  if (!project || "error" in project) {
    throw error(404, "Project not found");
  }
  return { project };
};

export const actions: Actions = {
  rename: async ({ request, params }) => {
    const name = (await request.formData()).get("name");
    if (typeof name !== "string" || name.trim().length === 0) {
      return fail(400, { error: "Name required" });
    }
    await renameProject(params.id, name.trim());
    return { success: true };
  },

  saveInstructions: async ({ request, params }) => {
    const content = (await request.formData()).get("content");
    if (typeof content !== "string") {
      return fail(400, { error: "Content required" });
    }
    await writeProjectInstructions(params.id, content);
    return { success: true };
  },

  deleteProject: async ({ params }) => {
    await deleteProject(params.id);
    throw redirect(303, "/chat");
  },

  deleteConversation: async ({ request }) => {
    const id = (await request.formData()).get("id");
    if (typeof id !== "string" || id.length === 0) {
      return fail(400, { error: "Id required" });
    }
    await deleteConversation(id);
    return { success: true };
  },
};
