import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "$lib/server/db/client";
import { readFileOrEmpty } from "$lib/server/files";
import {
  getConversationRoot,
  getProjectRoot,
  getSessionsRoot,
  type ConversationLocator,
} from "$lib/server/paths";

const BASE_INSTRUCTIONS = `# Workspace conventions

- ./input contains user-provided files; treat them as read-only.
- Use ./scratchpad for working notes, intermediate files, and experiments; the user never sees it.
- Save every deliverable (documents, code, exports, reports) to ./output.
- Everything else you create in the working directory is visible to the user.
`;

export function globalInstructionsPath(): string {
  return resolve(getSessionsRoot(), "instructions.md");
}

export function projectInstructionsPath(projectId: string): string {
  return resolve(getProjectRoot(projectId), "instructions.md");
}

export function globalSkillsDir(): string {
  return resolve(getSessionsRoot(), "skills");
}

export function projectSkillsDir(projectId: string): string {
  return resolve(getProjectRoot(projectId), "skills");
}

async function listSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Writes the merged agent-facing runtime files into a conversation root:
 * AGENTS.md (+ CLAUDE.md symlink) and per-skill symlinks in the discovery
 * locations each agent reads (.opencode/skills, .claude/skills).
 */
export async function materializeConversationRuntime(
  locator: ConversationLocator,
): Promise<void> {
  const root = getConversationRoot(locator);
  const sections = [BASE_INSTRUCTIONS];
  const globalText = (await readFileOrEmpty(globalInstructionsPath())).trim();
  if (globalText) sections.push(globalText);
  if (locator.project_id) {
    const projectText = (
      await readFileOrEmpty(projectInstructionsPath(locator.project_id))
    ).trim();
    if (projectText) sections.push(projectText);
  }
  await writeFile(resolve(root, "AGENTS.md"), sections.join("\n\n") + "\n");
  await symlink("AGENTS.md", resolve(root, "CLAUDE.md")).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });

  const sources = new Map<string, string>();
  for (const name of await listSkillNames(globalSkillsDir())) {
    sources.set(name, resolve(globalSkillsDir(), name));
  }
  if (locator.project_id) {
    for (const name of await listSkillNames(projectSkillsDir(locator.project_id))) {
      sources.set(name, resolve(projectSkillsDir(locator.project_id), name));
    }
  }
  for (const discoveryDir of [".opencode/skills", ".claude/skills"]) {
    const target = resolve(root, discoveryDir);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    for (const [name, source] of sources) {
      await symlink(source, resolve(target, name));
    }
  }
}

/** Re-materializes every conversation affected by a scope's config change. */
export async function resyncScope(projectId: string | null): Promise<void> {
  const affected = await db.query.conversation.findMany({
    columns: { id: true, project_id: true },
    where: projectId ? (fields, { eq }) => eq(fields.project_id, projectId) : undefined,
  });
  for (const conv of affected) {
    await materializeConversationRuntime(conv).catch((error) => {
      console.warn(`Failed to resync conversation ${conv.id}:`, error);
    });
  }
}

export async function readGlobalInstructions(): Promise<string> {
  return readFileOrEmpty(globalInstructionsPath());
}

export async function writeGlobalInstructions(content: string): Promise<void> {
  const path = globalInstructionsPath();
  if (content.trim().length === 0) {
    await rm(path, { force: true });
  } else {
    await writeFile(path, content);
  }
  await resyncScope(null);
}

export async function readProjectInstructions(projectId: string): Promise<string> {
  return readFileOrEmpty(projectInstructionsPath(projectId));
}

export async function writeProjectInstructions(
  projectId: string,
  content: string,
): Promise<void> {
  const path = projectInstructionsPath(projectId);
  if (content.trim().length === 0) {
    await rm(path, { force: true });
  } else {
    await mkdir(getProjectRoot(projectId), { recursive: true });
    await writeFile(path, content);
  }
  await resyncScope(projectId);
}
