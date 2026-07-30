import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { HttpError } from "$lib/server/http-error";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { configScopeDir, type ConfigScope } from "$lib/server/opencode/config-file";
import { disposeProjectInstances } from "$lib/server/projects";
import { getSessionsRoot } from "$lib/server/paths";

/**
 * Skills are SKILL.md files OpenCode discovers on the directory walk-up:
 * global ones under `$XDG_CONFIG_HOME/opencode/skills/`, project ones under
 * `<projectRoot>/.opencode/skills/`. The files are the source of truth.
 */

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface SkillEntry {
  name: string;
  description: string;
  content: string;
  scope: ConfigScope;
}

function skillsDir(scope: ConfigScope): string {
  return scope.kind === "global"
    ? resolve(configScopeDir(scope), "skills")
    : resolve(configScopeDir(scope), ".opencode", "skills");
}

function skillFilePath(scope: ConfigScope, name: string): string {
  return resolve(skillsDir(scope), name, "SKILL.md");
}

function serializeSkill(name: string, description: string, content: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${content.trim()}\n`;
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;

function parseSkill(raw: string): { description: string; content: string } {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) return { description: "", content: raw.trim() };
  const description =
    match[1]
      .split("\n")
      .find((line) => line.startsWith("description:"))
      ?.slice("description:".length)
      .trim() ?? "";
  return { description, content: raw.slice(match[0].length).trim() };
}

/** Global skill changes need a server restart (global layer is cached process-wide). */
async function disposeScope(scope: ConfigScope): Promise<void> {
  if (scope.kind === "global") {
    await opencodeServer.restart();
    return;
  }
  await disposeProjectInstances(scope.projectId);
  await opencodeServer.disposeDirectory(configScopeDir(scope));
}

/**
 * List skills visible to a scope via OpenCode's own discovery (so ordering and
 * shadowing match runtime), tagging each entry with the scope that owns it.
 */
export async function listSkills(projectId?: string): Promise<SkillEntry[]> {
  const directory = projectId
    ? configScopeDir({ kind: "project", projectId })
    : getSessionsRoot();
  const { client } = await opencodeServer.directoryClient(directory);
  const { data, error } = await client.app.skills();
  if (error || !data) throw new Error("Failed to list skills");

  const projectPrefix = projectId
    ? skillsDir({ kind: "project", projectId })
    : null;

  return data.map((skill) => ({
    name: skill.name,
    description: skill.description,
    content: skill.content,
    scope:
      projectPrefix && skill.location.startsWith(projectPrefix)
        ? { kind: "project" as const, projectId: projectId! }
        : { kind: "global" as const },
  }));
}

export async function upsertSkill(
  scope: ConfigScope,
  name: string,
  description: string,
  content: string,
): Promise<void> {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new HttpError(400, "Skill name must be lowercase kebab-case");
  }
  const path = skillFilePath(scope, name);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, serializeSkill(name, description, content), "utf8");
  await disposeScope(scope);
}

export async function readSkill(
  scope: ConfigScope,
  name: string,
): Promise<{ description: string; content: string }> {
  try {
    return parseSkill(await readFile(skillFilePath(scope, name), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HttpError(404, "Skill not found");
    }
    throw error;
  }
}

export async function deleteSkill(scope: ConfigScope, name: string): Promise<void> {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new HttpError(400, "Skill name must be lowercase kebab-case");
  }
  await readSkill(scope, name);
  await rm(resolve(skillsDir(scope), name), { recursive: true });
  await disposeScope(scope);
}
