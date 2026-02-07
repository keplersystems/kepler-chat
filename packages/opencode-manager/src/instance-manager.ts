import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import { db } from "@kepler-chat/db";
import { opencodeInstance } from "@kepler-chat/db/schema/opencode";
import { env } from "@kepler-chat/env/server";
import { wrapCommandForUser } from "@kepler-chat/sandbox";
import { eq } from "drizzle-orm";
import { allocatePort, releasePort, reservePort } from "./port-allocator";
import { loadUserProviderEnv } from "./provider-env";
import { resolve, join } from "path";
import { mkdir } from "fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type OpencodeInstanceStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

interface OpencodeInstanceData {
  client: OpencodeClient;
  url: string;
  port: number;
  pid: number;
  close: () => Promise<void>;
}

const instances = new Map<string, OpencodeInstanceData>();
let cleanupInterval: Timer | null = null;
const OPENCODE_START_TIMEOUT_MS = 5000;

interface OpencodeSpawnResult {
  url: string;
  pid: number;
  close: () => void;
}

function getUserPath(userId: string): string {
  return resolve(env.KEPLER_SESSIONS_PATH, userId);
}

async function prepareUserDirectories(userPath: string): Promise<{
  xdgData: string;
  xdgCache: string;
  xdgConfig: string;
  xdgState: string;
}> {
  const inputPath = join(userPath, "input");
  const outputPath = join(userPath, "output");
  const playgroundPath = join(userPath, "playground");

  const opencodeRoot = join(userPath, ".opencode");
  const xdgData = join(opencodeRoot, "data");
  const xdgCache = join(opencodeRoot, "cache");
  const xdgConfig = join(opencodeRoot, "config");
  const xdgState = join(opencodeRoot, "state");

  await Promise.all([
    mkdir(userPath, { recursive: true }),
    mkdir(inputPath, { recursive: true }),
    mkdir(outputPath, { recursive: true }),
    mkdir(playgroundPath, { recursive: true }),
    mkdir(xdgData, { recursive: true }),
    mkdir(xdgCache, { recursive: true }),
    mkdir(xdgConfig, { recursive: true }),
    mkdir(xdgState, { recursive: true }),
  ]);

  return { xdgData, xdgCache, xdgConfig, xdgState };
}

async function createOpencodeEnv(
  userId: string,
  xdgPaths: {
    xdgData: string;
    xdgCache: string;
    xdgConfig: string;
    xdgState: string;
  },
): Promise<NodeJS.ProcessEnv> {
  const existingPermissionRaw = process.env.OPENCODE_PERMISSION;
  const permissionConfig = existingPermissionRaw
    ? (JSON.parse(existingPermissionRaw) as Record<string, unknown>)
    : {};
  const providerEnv = await loadUserProviderEnv(userId);
  const enforced = ["webfetch", "websearch", "codesearch"] as const;

  for (const tool of enforced) {
    const current = permissionConfig[tool];
    if (current === "allow") {
      throw new Error(
        `OPENCODE_PERMISSION for "${tool}" must be "ask" or "deny" to enforce network policy.`,
      );
    }
    if (current && typeof current === "object") {
      for (const action of Object.values(current as Record<string, unknown>)) {
        if (action === "allow") {
          throw new Error(
            `OPENCODE_PERMISSION for "${tool}" must not include "allow" rules to enforce network policy.`,
          );
        }
      }
    }
    if (current === undefined) {
      permissionConfig[tool] = "ask";
    }
  }

  return {
    ...process.env,
    ...providerEnv,
    XDG_DATA_HOME: xdgPaths.xdgData,
    XDG_CACHE_HOME: xdgPaths.xdgCache,
    XDG_CONFIG_HOME: xdgPaths.xdgConfig,
    XDG_STATE_HOME: xdgPaths.xdgState,
    OPENCODE_PERMISSION: JSON.stringify(permissionConfig),
  };
}

function waitForServerUrl(
  proc: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      proc.kill();
      reject(
        new Error(`Timeout waiting for server to start after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    let output = "";

    const cleanup = () => {
      clearTimeout(timeoutId);
      proc.stdout.off("data", handleOutput);
      proc.stderr.off("data", handleOutput);
      proc.off("exit", handleExit);
      proc.off("error", handleError);
    };

    const handleOutput = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match) {
            proc.kill();
            cleanup();
            reject(
              new Error(`Failed to parse server url from output: ${line}`),
            );
            return;
          }
          cleanup();
          resolve(match[1]!);
          return;
        }
      }
    };

    const handleExit = (code: number | null) => {
      cleanup();
      let message = `Server exited with code ${code}`;
      if (output.trim()) {
        message += `\nServer output: ${output}`;
      }
      reject(new Error(message));
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    proc.stdout.on("data", handleOutput);
    proc.stderr.on("data", handleOutput);
    proc.on("exit", handleExit);
    proc.on("error", handleError);
  });
}

async function spawnSandboxedOpencodeServer(options: {
  userId: string;
  userPath: string;
  port: number;
  hostname: string;
  xdgPaths: {
    xdgData: string;
    xdgCache: string;
    xdgConfig: string;
    xdgState: string;
  };
}): Promise<OpencodeSpawnResult> {
  const args = [
    "serve",
    `--hostname=${options.hostname}`,
    `--port=${options.port}`,
  ];
  const command = `opencode ${args.join(" ")}`;
  const sandboxedCommand = await wrapCommandForUser(command, options.userId);

  const proc = spawn(sandboxedCommand, {
    shell: true,
    cwd: options.userPath,
    env: await createOpencodeEnv(options.userId, options.xdgPaths),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = await waitForServerUrl(proc, OPENCODE_START_TIMEOUT_MS);

  return {
    url,
    pid: proc.pid ?? 0,
    close: () => proc.kill(),
  };
}

/**
 * Manages OpenCode instance lifecycle for all users.
 * Each user gets one persistent instance that handles multiple conversations.
 */
export class OpencodeInstanceManager {
  constructor() {
    this.initializePortAllocator();
    this.startCleanupTask();
  }

  /**
   * On startup, mark ports from DB as allocated if instances are still running.
   */
  private async initializePortAllocator(): Promise<void> {
    const runningInstances = await db.query.opencodeInstance.findMany({
      where: eq(opencodeInstance.status, "running"),
    });

    for (const instance of runningInstances) {
      const isHealthy = await this.healthCheck(instance.user_id);
      if (isHealthy) {
        reservePort(instance.port);
        continue;
      }
      releasePort(instance.port);
      await db
        .update(opencodeInstance)
        .set({ status: "stopped" as OpencodeInstanceStatus })
        .where(eq(opencodeInstance.user_id, instance.user_id));
    }
  }

  /**
   * Gets existing instance or spawns a new one for the user.
   * Updates last_active_at timestamp.
   */
  async getOrSpawn(userId: string): Promise<OpencodeInstanceData> {
    const existing = instances.get(userId);
    if (existing) {
      await this.updateLastActive(userId);
      return existing;
    }

    const userPath = getUserPath(userId);
    const dbInstance = await db.query.opencodeInstance.findFirst({
      where: eq(opencodeInstance.user_id, userId),
    });

    if (dbInstance?.status === "running") {
      const isHealthy = await this.healthCheck(userId);
      if (isHealthy) {
        reservePort(dbInstance.port);
        const instanceData = {
          client: createOpencodeClient({
            baseUrl: dbInstance.server_url,
            directory: userPath,
          }),
          url: dbInstance.server_url,
          port: dbInstance.port,
          pid: dbInstance.pid ?? 0,
          close: async () => {
            if (dbInstance.pid && dbInstance.pid > 0) {
              try {
                process.kill(dbInstance.pid, "SIGTERM");
              } catch {
                // ignore ESRCH if process already exited
              }
            }
            releasePort(dbInstance.port);
          },
        };
        instances.set(userId, instanceData);
        await this.updateLastActive(userId);
        return instanceData;
      } else {
        // Health check failed - clean up stale record and release port
        releasePort(dbInstance.port);
        await db
          .update(opencodeInstance)
          .set({ status: "stopped" as OpencodeInstanceStatus })
          .where(eq(opencodeInstance.user_id, userId));
      }
    }

    return this.spawn(userId);
  }

  /**
   * Spawns a new sandboxed OpenCode instance for the user.
   */
  private async spawn(userId: string): Promise<OpencodeInstanceData> {
    const port = await allocatePort();
    const userPath = getUserPath(userId);
    const xdgPaths = await prepareUserDirectories(userPath);

    const now = Date.now();
    await db
      .insert(opencodeInstance)
      .values({
        user_id: userId,
        server_url: `http://127.0.0.1:${port}`,
        port,
        spawned_at: new Date(now),
        last_active_at: new Date(now),
        status: "starting" as OpencodeInstanceStatus,
      })
      .onConflictDoUpdate({
        target: opencodeInstance.user_id,
        set: {
          server_url: `http://127.0.0.1:${port}`,
          port,
          spawned_at: new Date(now),
          last_active_at: new Date(now),
          status: "starting" as OpencodeInstanceStatus,
          error: null,
        },
      });

    let server: OpencodeSpawnResult;

    try {
      server = await spawnSandboxedOpencodeServer({
        userId,
        userPath,
        hostname: "127.0.0.1",
        port,
        xdgPaths,
      });
    } catch (error) {
      releasePort(port);
      await db
        .update(opencodeInstance)
        .set({
          status: "error" as OpencodeInstanceStatus,
          error:
            error instanceof Error
              ? error.message
              : "Failed to start OpenCode server",
        })
        .where(eq(opencodeInstance.user_id, userId));
      throw error;
    }

    await db
      .update(opencodeInstance)
      .set({
        status: "running" as OpencodeInstanceStatus,
        pid: server.pid,
        server_url: server.url,
      })
      .where(eq(opencodeInstance.user_id, userId));

    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: userPath,
    });

    const instanceData: OpencodeInstanceData = {
      client,
      url: server.url,
      port,
      pid: server.pid ?? 0,
      close: async () => {
        await server.close();
        releasePort(port);
      },
    };

    instances.set(userId, instanceData);
    return instanceData;
  }

  /**
   * Tears down the OpenCode instance for a user.
   */
  async teardown(userId: string): Promise<void> {
    const instance = instances.get(userId);
    if (instance) {
      await db
        .update(opencodeInstance)
        .set({ status: "stopping" as OpencodeInstanceStatus })
        .where(eq(opencodeInstance.user_id, userId));

      await instance.close();
      instances.delete(userId);

      await db
        .update(opencodeInstance)
        .set({ status: "stopped" as OpencodeInstanceStatus, pid: null })
        .where(eq(opencodeInstance.user_id, userId));
      return;
    }

    const dbInstance = await db.query.opencodeInstance.findFirst({
      where: eq(opencodeInstance.user_id, userId),
    });
    if (!dbInstance) {
      return;
    }

    await db
      .update(opencodeInstance)
      .set({ status: "stopping" as OpencodeInstanceStatus })
      .where(eq(opencodeInstance.user_id, userId));

    if (dbInstance.pid && dbInstance.pid > 0) {
      try {
        process.kill(dbInstance.pid, "SIGTERM");
      } catch {
        // ignore ESRCH if process already exited
      }
    }

    releasePort(dbInstance.port);

    await db
      .update(opencodeInstance)
      .set({ status: "stopped" as OpencodeInstanceStatus, pid: null })
      .where(eq(opencodeInstance.user_id, userId));
  }

  /**
   * Checks if the OpenCode instance is healthy by calling its API.
   */
  async healthCheck(userId: string): Promise<boolean> {
    const instance = instances.get(userId);
    if (instance) {
      const response = await fetch(instance.url).catch(() => null);
      return response?.ok ?? false;
    }

    const dbInstance = await db.query.opencodeInstance.findFirst({
      where: eq(opencodeInstance.user_id, userId),
    });

    if (!dbInstance) return false;

    const response = await fetch(dbInstance.server_url).catch(() => null);
    return response?.ok ?? false;
  }

  /**
   * Updates the last_active_at timestamp for the user.
   */
  private async updateLastActive(userId: string): Promise<void> {
    await db
      .update(opencodeInstance)
      .set({ last_active_at: new Date() })
      .where(eq(opencodeInstance.user_id, userId));
  }

  /**
   * Background task that tears down idle instances.
   */
  private startCleanupTask(): void {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(
      async () => {
        const idleThreshold = Date.now() - env.KEPLER_INSTANCE_IDLE_TIMEOUT;

        const idleInstances = await db.query.opencodeInstance.findMany({
          where: (fields, { and, eq, lt }) =>
            and(
              eq(fields.status, "running"),
              lt(fields.last_active_at, new Date(idleThreshold)),
            ),
        });

        for (const instance of idleInstances) {
          await this.teardown(instance.user_id);
        }
      },
      5 * 60 * 1000,
    ); // Check every 5 minutes
  }

  /**
   * Stops the cleanup task. Call on app shutdown.
   */
  stopCleanupTask(): void {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }

  /**
   * Tears down all running instances. Call on app shutdown.
   */
  async teardownAll(): Promise<void> {
    const userIds = Array.from(instances.keys());
    await Promise.all(userIds.map((userId) => this.teardown(userId)));
  }
}
