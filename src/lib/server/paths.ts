import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { env } from "$lib/env";

/**
 * Filesystem layout under KEPLER_SESSIONS_PATH:
 *
 *   .opencode/config/opencode/   global OpenCode config dir (via XDG_CONFIG_HOME)
 *   projects/{projectId}/        project root: AGENTS.md, opencode.json, .opencode/skills/
 *     conversations/{convId}/    project conversation roots (inherit project config up-walk)
 *   conversations/{convId}/      standalone conversation roots
 *
 * Inside each conversation root: input/ (user uploads), output/ (deliverables),
 * scratchpad/ (agent working space, hidden from the files panel).
 *
 * Conversation roots are the `directory` OpenCode requests run in; everything a
 * project defines (instructions, MCP servers, skills) is inherited because
 * OpenCode walks up from that directory.
 */

export interface ConversationLocator {
  id: string;
  project_id: string | null;
}

export function getSessionsRoot(): string {
  return resolve(env.KEPLER_SESSIONS_PATH);
}

/** Global OpenCode config dir ($XDG_CONFIG_HOME/opencode as set by the supervisor). */
export function getGlobalOpencodeConfigDir(): string {
  return resolve(getSessionsRoot(), ".opencode", "config", "opencode");
}

export function getProjectRoot(projectId: string): string {
  return resolve(getSessionsRoot(), "projects", projectId);
}

export function getConversationRoot(conversation: ConversationLocator): string {
  return conversation.project_id
    ? resolve(getProjectRoot(conversation.project_id), "conversations", conversation.id)
    : resolve(getSessionsRoot(), "conversations", conversation.id);
}

export function getConversationInputPath(conversation: ConversationLocator): string {
  return resolve(getConversationRoot(conversation), "input");
}

export function getConversationOutputPath(conversation: ConversationLocator): string {
  return resolve(getConversationRoot(conversation), "output");
}

export function getConversationScratchpadPath(conversation: ConversationLocator): string {
  return resolve(getConversationRoot(conversation), "scratchpad");
}

export async function provisionConversationDirectories(
  conversation: ConversationLocator,
): Promise<void> {
  await Promise.all([
    mkdir(getConversationInputPath(conversation), { recursive: true }),
    mkdir(getConversationOutputPath(conversation), { recursive: true }),
    mkdir(getConversationScratchpadPath(conversation), { recursive: true }),
  ]);
}

export async function provisionProjectDirectories(projectId: string): Promise<void> {
  await mkdir(resolve(getProjectRoot(projectId), "conversations"), { recursive: true });
}
