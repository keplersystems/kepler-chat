import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";

/**
 * `allowedDomains` is deliberately absent: the runtime treats a missing value
 * as "no network filtering" (policy is enforced via OpenCode permissions to
 * keep the server reachable on Linux), but the zod-inferred config type marks
 * the field required.
 */
type SandboxBaseConfig = Omit<SandboxRuntimeConfig, "network"> & {
  network: Omit<SandboxRuntimeConfig["network"], "allowedDomains">;
};

function createSandboxBaseConfig(): SandboxBaseConfig {
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

  sandboxInitPromise = SandboxManager.initialize(
    createSandboxBaseConfig() as SandboxRuntimeConfig,
  );
  return sandboxInitPromise;
}

/**
 * Wraps a command with sandbox restrictions scoped to the sessions root.
 */
export async function wrapCommandForSessionsRoot(
  command: string,
  sessionsRootPath: string,
): Promise<string> {
  await ensureSandboxInitialized();
  const base = createSandboxBaseConfig();
  return SandboxManager.wrapWithSandbox(command, undefined, {
    filesystem: {
      ...base.filesystem,
      allowWrite: [sessionsRootPath],
    },
  });
}
