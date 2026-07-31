import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { project } from "$lib/server/db/schema/kepler";
import { deleteConversation } from "$lib/server/conversations";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import { getProjectRoot, provisionProjectDirectories } from "$lib/server/paths";

export type ProjectRow = typeof project.$inferSelect;

export async function requireProject(id: string): Promise<ProjectRow> {
  const row = await db.query.project.findFirst({
    where: (fields, { eq: eqOp }) => eqOp(fields.id, id),
  });
  if (!row) throw new HttpError(404, "Project not found");
  return row;
}

export async function listProjects(): Promise<ProjectRow[]> {
  return db.query.project.findMany({
    orderBy: (fields, { desc }) => [desc(fields.updated_at)],
  });
}

export async function createProject(name: string): Promise<ProjectRow> {
  const id = generateId();
  await provisionProjectDirectories(id);
  const [row] = await db.insert(project).values({ id, name }).returning();
  return row;
}

export async function renameProject(id: string, name: string): Promise<ProjectRow> {
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
    columns: { id: true },
  });
  for (const conv of conversations) {
    await deleteConversation(conv.id);
  }
  await rm(getProjectRoot(id), { recursive: true, force: true });
  await db.delete(project).where(eq(project.id, id));
}
