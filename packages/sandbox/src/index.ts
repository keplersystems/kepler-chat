import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { env } from "@kepler-chat/env/server";
import { resolve } from "path";

/**
 * Creates sandbox configuration for a specific user.
 * Isolates filesystem access to user's session folder only.
 */
export function createSandboxConfig(userId: string): SandboxRuntimeConfig {
  const sessionsPath = env.KEPLER_SESSIONS_PATH;
  const userPath = resolve(sessionsPath, userId);

  return {
    filesystem: {
      denyRead: [
        "~/.ssh",
        "~/.aws",
        "~/.env",
        "/etc/passwd",
        "/etc/shadow",
      ],
      allowWrite: [userPath],
      denyWrite: [
        ".env",
        ".git/",
        ".bashrc",
        ".zshrc",
        ".bash_profile",
      ],
    },
    network: {
      allowedDomains: [
        "api.openai.com",
        "api.anthropic.com",
        "*.googleapis.com",
        "generativelanguage.googleapis.com",
      ],
      deniedDomains: [],
    },
  };
}

/**
 * Wraps a command with sandbox restrictions for the given user.
 * Must call SandboxManager.initialize() before using this.
 */
export async function wrapWithSandbox(
  command: string,
  userId: string
): Promise<string> {
  const config = createSandboxConfig(userId);
  await SandboxManager.initialize(config);
  return SandboxManager.wrapWithSandbox(command);
}

export { SandboxManager };
export type { SandboxRuntimeConfig };
