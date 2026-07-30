import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { conversation, project } from "$lib/server/db/schema/opencode";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import {
  getConversationRoot,
  getProjectRoot,
  provisionProjectDirectories,
} from "$lib/server/paths";

/**
 * A project groups conversations and owns a directory whose contents OpenCode
 * inherits for every conversation under it (via directory up-walk):
 * AGENTS.md (instructions), opencode.json (MCP servers, config), and
 * .opencode/skills/ (skills). The filesystem is the source of truth for all
 * OpenCode-facing content; the DB row only stores identity and grouping.
 */

export async function requireProject(id: string) {
  const row = await db.query.project.findFirst({
    where: (fields, { eq: eqOp }) => eqOp(fields.id, id),
  });
  if (!row) throw new HttpError(404, "Project not found");
  return row;
}

export async function listProjects() {
  return db.query.project.findMany({
    orderBy: (p, { desc }) => [desc(p.updated_at)],
  });
}

export async function createProject(name: string) {
  const id = generateId();
  await provisionProjectDirectories(id);
  const [row] = await db.insert(project).values({ id, name }).returning();
  return row;
}

export async function renameProject(id: string, name: string) {
  await requireProject(id);
  const [row] = await db
    .update(project)
    .set({ name })
    .where(eq(project.id, id))
    .returning();
  return row;
}

export async function deleteProject(id: string): Promise<void> {
  await requireProject(id);
  const conversations = await db.query.conversation.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.project_id, id),
  });

  for (const conv of conversations) {
    const { client } = await opencodeServer.conversationClient(conv);
    const { error } = await client.session.delete({
      sessionID: conv.opencode_session_id,
    });
    if (error) throw new Error(`Failed to delete OpenCode session for ${conv.id}`);
  }

  await rm(getProjectRoot(id), { recursive: true, force: true });
  await db.delete(project).where(eq(project.id, id));
}

function instructionsPath(projectId: string): string {
  return resolve(getProjectRoot(projectId), "AGENTS.md");
}

export async function getProjectInstructions(projectId: string): Promise<string> {
  try {
    return await readFile(instructionsPath(projectId), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function setProjectInstructions(
  projectId: string,
  content: string,
): Promise<void> {
  if (content.trim().length === 0) {
    await rm(instructionsPath(projectId), { force: true });
  } else {
    await writeFile(instructionsPath(projectId), content, "utf8");
  }
  await disposeProjectInstances(projectId);
}

/**
 * Drop cached OpenCode instances for every conversation in a project so
 * changed project files (AGENTS.md, opencode.json, skills) are re-read.
 */
export async function disposeProjectInstances(projectId: string): Promise<void> {
  const conversations = await db.query.conversation.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.project_id, projectId),
    columns: { id: true, project_id: true },
  });
  await Promise.all(
    conversations.map((conv) => opencodeServer.disposeDirectory(getConversationRoot(conv))),
  );
}
