import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import { getSessionsRoot } from "$lib/server/paths";

/**
 * `allowedDomains` is deliberately absent: the runtime treats a missing value
 * as "no network filtering" (agents need arbitrary provider/API access), but
 * the zod-inferred config type marks the field required.
 */
type SandboxBaseConfig = Omit<SandboxRuntimeConfig, "network"> & {
  network: Omit<SandboxRuntimeConfig["network"], "allowedDomains">;
};

function createSandboxBaseConfig(): SandboxBaseConfig {
  return {
    filesystem: {
      denyRead: ["~/.ssh", "~/.aws", "~/.env", "/etc/passwd", "/etc/shadow"],
      allowWrite: [],
      denyWrite: [".env", ".git/", ".bashrc", ".zshrc", ".bash_profile"],
    },
    network: {
      deniedDomains: [],
      allowLocalBinding: true,
    },
  };
}

let sandboxInitPromise: Promise<void> | null = null;

async function ensureSandboxInitialized(): Promise<void> {
  if (sandboxInitPromise) return sandboxInitPromise;

  if (!SandboxManager.isSupportedPlatform()) {
    throw new Error("Sandbox runtime is not supported on this platform");
  }

  const dependencyCheck = SandboxManager.checkDependencies();
  if (dependencyCheck.errors.length > 0) {
    throw new Error(
      `Sandbox runtime dependencies are missing: ${dependencyCheck.errors.join("; ")}`,
    );
  }

  sandboxInitPromise = SandboxManager.initialize(
    createSandboxBaseConfig() as SandboxRuntimeConfig,
  );
  return sandboxInitPromise;
}

function shellQuote(arg: string): string {
  return /^[A-Za-z0-9._\/=-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}

/**
 * Wraps an agent argv with sandbox restrictions: writable sessions root plus
 * the agent's own credential/cache paths (auth stores must stay writable or
 * token refresh breaks mid-session).
 */
export async function wrapAgentCommand(
  argv: string[],
  writablePaths: string[],
): Promise<string> {
  await ensureSandboxInitialized();
  const base = createSandboxBaseConfig();
  return SandboxManager.wrapWithSandbox(argv.map(shellQuote).join(" "), undefined, {
    filesystem: {
      ...base.filesystem,
      allowWrite: [getSessionsRoot(), ...writablePaths],
    },
  });
}
