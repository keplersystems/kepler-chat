import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SkillEntry } from "$lib/contracts";
import { isEnoent } from "$lib/server/files";
import { globalSkillsDir, projectSkillsDir, resyncScope } from "$lib/server/runtime";


function skillsDir(projectId: string | null): string {
  return projectId ? projectSkillsDir(projectId) : globalSkillsDir();
}

function serializeSkill(name: string, description: string, content: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}\n`;
}

function parseSkill(raw: string): { description: string; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return { description: "", content: raw.trim() };
  const description = match[1].match(/^description:\s*(.*)$/m)?.[1].trim() ?? "";
  return { description, content: match[2].replace(/\n$/, "") };
}

async function readScope(
  projectId: string | null,
  scope: "global" | "project",
): Promise<SkillEntry[]> {
  const dir = skillsDir(projectId);
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
  const entries: SkillEntry[] = [];
  for (const name of names.sort()) {
    try {
      const raw = await readFile(resolve(dir, name, "SKILL.md"), "utf8");
      const { description, content } = parseSkill(raw);
      entries.push({ name, description, content, scope });
    } catch (error) {
      if (!isEnoent(error)) throw error;
    }
  }
  return entries;
}

/** Project skills shadow same-named global skills, matching agent discovery. */
export async function listSkills(projectId: string | null): Promise<SkillEntry[]> {
  const global = await readScope(null, "global");
  if (!projectId) return global;
  const project = await readScope(projectId, "project");
  const shadowed = new Set(project.map((entry) => entry.name));
  return [...project, ...global.filter((entry) => !shadowed.has(entry.name))];
}

export async function upsertSkill(
  name: string,
  projectId: string | null,
  description: string,
  content: string,
): Promise<void> {
  const dir = resolve(skillsDir(projectId), name);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "SKILL.md"), serializeSkill(name, description, content));
  await resyncScope(projectId);
}

export async function deleteSkill(name: string, projectId: string | null): Promise<void> {
  await rm(resolve(skillsDir(projectId), name), { recursive: true, force: true });
  await resyncScope(projectId);
}
