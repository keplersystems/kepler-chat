import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import { resolve } from "path";

const NETWORK_ALLOWLIST = [
  "api.openai.com",
  "api.anthropic.com",
  "*.googleapis.com",
  "generativelanguage.googleapis.com",
  "mcp.exa.ai",
] as const;

export function getNetworkAllowlist(): readonly string[] {
  return NETWORK_ALLOWLIST;
}

/**
 * Creates the base sandbox configuration.
 * Conversation-specific allowWrite paths are provided at command wrap time.
 */
export function createSandboxBaseConfig(): SandboxRuntimeConfig {
  return {
    filesystem: {
      denyRead: [
        "~/.ssh",
        "~/.aws",
        "~/.env",
        "/etc/passwd",
        "/etc/shadow",
      ],
      allowWrite: [],
      denyWrite: [
        ".env",
        ".git/",
        ".bashrc",
        ".zshrc",
        ".bash_profile",
      ],
    },
    network: {
      // Network policy is enforced via OpenCode permissions to keep the server reachable on Linux.
      allowedDomains: undefined as unknown as string[],
      deniedDomains: [],
      allowLocalBinding: true,
    },
  };
}

let sandboxInitPromise: Promise<void> | null = null;

/**
 * Initializes the sandbox runtime once for this process.
 */
export async function ensureSandboxInitialized(): Promise<void> {
  if (sandboxInitPromise) {
    return sandboxInitPromise;
  }

  if (!SandboxManager.isSupportedPlatform()) {
    throw new Error("Sandbox runtime is not supported on this platform");
  }

  const dependencyCheck = SandboxManager.checkDependencies();
  if (dependencyCheck.errors.length > 0) {
    throw new Error(
      `Sandbox runtime dependencies are missing: ${dependencyCheck.errors.join(
        "; ",
      )}`,
    );
  }

  sandboxInitPromise = SandboxManager.initialize(createSandboxBaseConfig());
  return sandboxInitPromise;
}

/**
 * Wraps a command with sandbox restrictions scoped to a conversation root.
 */
export async function wrapCommandForConversation(
  command: string,
  conversationRootPath: string,
): Promise<string> {
  await ensureSandboxInitialized();
  return SandboxManager.wrapWithSandbox(command, undefined, {
    filesystem: {
      allowWrite: [conversationRootPath],
    },
  });
}

export { SandboxManager };
export type { SandboxRuntimeConfig };
