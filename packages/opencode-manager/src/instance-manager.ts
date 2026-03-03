import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import { db } from "@kepler-chat/db";
import { opencodeConversationInstance } from "@kepler-chat/db/schema/opencode";
import { env } from "@kepler-chat/env/server";
import { wrapCommandForConversation } from "@kepler-chat/sandbox";
import { eq } from "drizzle-orm";
import { allocatePort, releasePort, reservePort } from "./port-allocator";
import { loadUserProviderEnv } from "./provider-env";
import { resolve, join } from "path";
import { mkdir } from "fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type InstanceStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

interface ConversationInstanceData {
  client: OpencodeClient;
  url: string;
  port: number;
  pid: number;
  userId: string;
  conversationId: string;
  close: () => Promise<void>;
}

interface SpawnResult {
  url: string;
  pid: number;
  close: () => void;
}

const instances = new Map<string, ConversationInstanceData>();
let cleanupInterval: Timer | null = null;
const OPENCODE_START_TIMEOUT_MS = 5000;
const MAX_INSTANCES_PER_USER = 3;
const SYSTEM_INSTANCE_PREFIX = "__system__";

function isSystemInstance(conversationId: string): boolean {
  return conversationId.startsWith(SYSTEM_INSTANCE_PREFIX);
}

function getConversationRoot(
  userId: string,
  conversationId: string,
): string {
  return resolve(
    env.KEPLER_SESSIONS_PATH,
    userId,
    "conversations",
    conversationId,
  );
}

async function prepareConversationDirectories(
  conversationRoot: string,
): Promise<{
  xdgData: string;
  xdgCache: string;
  xdgConfig: string;
  xdgState: string;
}> {
  const inputPath = join(conversationRoot, "input");
  const outputPath = join(conversationRoot, "output");
  const playgroundPath = join(conversationRoot, "playground");

  const opencodeRoot = join(conversationRoot, ".opencode");
  const xdgData = join(opencodeRoot, "data");
  const xdgCache = join(opencodeRoot, "cache");
  const xdgConfig = join(opencodeRoot, "config");
  const xdgState = join(opencodeRoot, "state");

  await Promise.all([
    mkdir(conversationRoot, { recursive: true }),
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

async function spawnSandboxedServer(options: {
  userId: string;
  conversationRoot: string;
  port: number;
  hostname: string;
  xdgPaths: {
    xdgData: string;
    xdgCache: string;
    xdgConfig: string;
    xdgState: string;
  };
}): Promise<SpawnResult> {
  const args = [
    "serve",
    `--hostname=${options.hostname}`,
    `--port=${options.port}`,
  ];
  const command = `opencode ${args.join(" ")}`;
  const sandboxedCommand = await wrapCommandForConversation(
    command,
    options.conversationRoot,
  );

  const proc = spawn(sandboxedCommand, {
    shell: true,
    cwd: options.conversationRoot,
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
 * Manages OpenCode instance lifecycle per conversation.
 * Each conversation gets its own sandboxed process with isolated filesystem.
 */
export class OpencodeInstanceManager {
  constructor() {
    this.initializePortAllocator();
    this.startCleanupTask();
  }

  private async initializePortAllocator(): Promise<void> {
    const runningInstances =
      await db.query.opencodeConversationInstance.findMany({
        where: eq(opencodeConversationInstance.status, "running"),
      });

    for (const instance of runningInstances) {
      const isHealthy = await this.healthCheck(instance.conversation_id);
      if (isHealthy) {
        reservePort(instance.port);
        continue;
      }
      releasePort(instance.port);
      await db
        .update(opencodeConversationInstance)
        .set({ status: "stopped" as InstanceStatus })
        .where(
          eq(
            opencodeConversationInstance.conversation_id,
            instance.conversation_id,
          ),
        );
    }
  }

  private countUserInstances(userId: string): number {
    let count = 0;
    for (const inst of instances.values()) {
      if (inst.userId === userId && !isSystemInstance(inst.conversationId)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Gets existing instance or spawns a new one for the conversation.
   */
  async getOrSpawn(
    userId: string,
    conversationId: string,
  ): Promise<ConversationInstanceData> {
    const existing = instances.get(conversationId);
    if (existing) {
      await this.updateLastActive(conversationId);
      return existing;
    }

    const conversationRoot = getConversationRoot(userId, conversationId);
    const dbInstance =
      await db.query.opencodeConversationInstance.findFirst({
        where: eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      });

    if (dbInstance?.status === "running") {
      const isHealthy = await this.healthCheck(conversationId);
      if (isHealthy) {
        reservePort(dbInstance.port);
        const instanceData: ConversationInstanceData = {
          client: createOpencodeClient({
            baseUrl: dbInstance.server_url,
            directory: conversationRoot,
          }),
          url: dbInstance.server_url,
          port: dbInstance.port,
          pid: dbInstance.pid ?? 0,
          userId,
          conversationId,
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
        instances.set(conversationId, instanceData);
        await this.updateLastActive(conversationId);
        return instanceData;
      } else {
        releasePort(dbInstance.port);
        await db
          .update(opencodeConversationInstance)
          .set({ status: "stopped" as InstanceStatus })
          .where(
            eq(
              opencodeConversationInstance.conversation_id,
              conversationId,
            ),
          );
      }
    }

    return this.spawn(userId, conversationId);
  }

  /**
   * Returns any healthy running instance for the user.
   * If none exists, spawns a system-level instance for user-scoped operations
   * (provider queries, auth management).
   */
  async getOrSpawnAnyForUser(userId: string): Promise<ConversationInstanceData> {
    const existing = await this.getAnyForUser(userId);
    if (existing) return existing;

    return this.getOrSpawn(userId, `${SYSTEM_INSTANCE_PREFIX}${userId}`);
  }

  /**
   * Returns any healthy running instance for the user.
   * Used for user-level operations (provider queries, auth) that don't
   * belong to a specific conversation.
   * Returns null if no running instance is available.
   */
  async getAnyForUser(userId: string): Promise<ConversationInstanceData | null> {
    for (const inst of instances.values()) {
      if (inst.userId === userId) {
        await this.updateLastActive(inst.conversationId);
        return inst;
      }
    }

    const dbInstance =
      await db.query.opencodeConversationInstance.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.user_id, userId),
            eq(fields.status, "running"),
          ),
      });

    if (dbInstance) {
      const isHealthy = await this.healthCheck(dbInstance.conversation_id);
      if (isHealthy) {
        return this.getOrSpawn(userId, dbInstance.conversation_id);
      }
    }

    return null;
  }

  private async spawn(
    userId: string,
    conversationId: string,
  ): Promise<ConversationInstanceData> {
    const activeCount = this.countUserInstances(userId);
    if (activeCount >= MAX_INSTANCES_PER_USER) {
      throw new Error(
        `User has reached the maximum of ${MAX_INSTANCES_PER_USER} active conversation instances`,
      );
    }

    const port = await allocatePort();
    const conversationRoot = getConversationRoot(userId, conversationId);
    const xdgPaths = await prepareConversationDirectories(conversationRoot);

    const now = Date.now();
    await db
      .insert(opencodeConversationInstance)
      .values({
        conversation_id: conversationId,
        user_id: userId,
        server_url: `http://127.0.0.1:${port}`,
        port,
        spawned_at: new Date(now),
        last_active_at: new Date(now),
        status: "starting" as InstanceStatus,
      })
      .onConflictDoUpdate({
        target: opencodeConversationInstance.conversation_id,
        set: {
          server_url: `http://127.0.0.1:${port}`,
          port,
          spawned_at: new Date(now),
          last_active_at: new Date(now),
          status: "starting" as InstanceStatus,
          error: null,
        },
      });

    let server: SpawnResult;

    try {
      server = await spawnSandboxedServer({
        userId,
        conversationRoot,
        hostname: "127.0.0.1",
        port,
        xdgPaths,
      });
    } catch (error) {
      releasePort(port);
      await db
        .update(opencodeConversationInstance)
        .set({
          status: "error" as InstanceStatus,
          error:
            error instanceof Error
              ? error.message
              : "Failed to start OpenCode server",
        })
        .where(
          eq(
            opencodeConversationInstance.conversation_id,
            conversationId,
          ),
        );
      throw error;
    }

    await db
      .update(opencodeConversationInstance)
      .set({
        status: "running" as InstanceStatus,
        pid: server.pid,
        server_url: server.url,
      })
      .where(
        eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      );

    const client = createOpencodeClient({
      baseUrl: server.url,
      directory: conversationRoot,
    });

    const instanceData: ConversationInstanceData = {
      client,
      url: server.url,
      port,
      pid: server.pid ?? 0,
      userId,
      conversationId,
      close: async () => {
        await server.close();
        releasePort(port);
      },
    };

    instances.set(conversationId, instanceData);
    return instanceData;
  }

  async teardown(conversationId: string): Promise<void> {
    const instance = instances.get(conversationId);
    if (instance) {
      await db
        .update(opencodeConversationInstance)
        .set({ status: "stopping" as InstanceStatus })
        .where(
          eq(
            opencodeConversationInstance.conversation_id,
            conversationId,
          ),
        );

      await instance.close();
      instances.delete(conversationId);

      await db
        .update(opencodeConversationInstance)
        .set({ status: "stopped" as InstanceStatus, pid: null })
        .where(
          eq(
            opencodeConversationInstance.conversation_id,
            conversationId,
          ),
        );
      return;
    }

    const dbInstance =
      await db.query.opencodeConversationInstance.findFirst({
        where: eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      });
    if (!dbInstance) return;

    await db
      .update(opencodeConversationInstance)
      .set({ status: "stopping" as InstanceStatus })
      .where(
        eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      );

    if (dbInstance.pid && dbInstance.pid > 0) {
      try {
        process.kill(dbInstance.pid, "SIGTERM");
      } catch {
        // ignore ESRCH if process already exited
      }
    }

    releasePort(dbInstance.port);

    await db
      .update(opencodeConversationInstance)
      .set({ status: "stopped" as InstanceStatus, pid: null })
      .where(
        eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      );
  }

  async healthCheck(conversationId: string): Promise<boolean> {
    const instance = instances.get(conversationId);
    if (instance) {
      const response = await fetch(instance.url).catch(() => null);
      return response?.ok ?? false;
    }

    const dbInstance =
      await db.query.opencodeConversationInstance.findFirst({
        where: eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      });

    if (!dbInstance) return false;

    const response = await fetch(dbInstance.server_url).catch(() => null);
    return response?.ok ?? false;
  }

  private async updateLastActive(conversationId: string): Promise<void> {
    await db
      .update(opencodeConversationInstance)
      .set({ last_active_at: new Date() })
      .where(
        eq(
          opencodeConversationInstance.conversation_id,
          conversationId,
        ),
      );
  }

  private startCleanupTask(): void {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(
      async () => {
        const idleThreshold = Date.now() - env.KEPLER_INSTANCE_IDLE_TIMEOUT;

        const idleInstances =
          await db.query.opencodeConversationInstance.findMany({
            where: (fields, { and, eq, lt }) =>
              and(
                eq(fields.status, "running"),
                lt(fields.last_active_at, new Date(idleThreshold)),
              ),
          });

        for (const instance of idleInstances) {
          await this.teardown(instance.conversation_id);
        }
      },
      5 * 60 * 1000,
    );
  }

  stopCleanupTask(): void {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }

  /**
   * Tears down all running instances for a user.
   * Used when user-level config changes (e.g. provider env) require restart.
   */
  async teardownAllForUser(userId: string): Promise<void> {
    const userInstances: string[] = [];
    for (const [convId, inst] of instances.entries()) {
      if (inst.userId === userId) {
        userInstances.push(convId);
      }
    }

    const dbInstances =
      await db.query.opencodeConversationInstance.findMany({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.user_id, userId),
            eq(fields.status, "running"),
          ),
      });

    for (const dbInst of dbInstances) {
      if (!userInstances.includes(dbInst.conversation_id)) {
        userInstances.push(dbInst.conversation_id);
      }
    }

    await Promise.all(
      userInstances.map((id) => this.teardown(id)),
    );
  }

  /**
   * Returns all healthy running instances for a user.
   * Checks both in-memory cache and DB state (for instances surviving a
   * process restart), reconstituting DB-only instances via getOrSpawn.
   */
  async getAllForUser(userId: string): Promise<ConversationInstanceData[]> {
    const seen = new Set<string>();
    const result: ConversationInstanceData[] = [];

    for (const inst of instances.values()) {
      if (inst.userId === userId) {
        seen.add(inst.conversationId);
        result.push(inst);
      }
    }

    // Pick up instances that exist in DB but not in memory (e.g. after restart).
    const dbInstances =
      await db.query.opencodeConversationInstance.findMany({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.user_id, userId),
            eq(fields.status, "running"),
          ),
      });

    for (const dbInst of dbInstances) {
      if (seen.has(dbInst.conversation_id)) continue;
      const isHealthy = await this.healthCheck(dbInst.conversation_id);
      if (!isHealthy) continue;
      const inst = await this.getOrSpawn(userId, dbInst.conversation_id);
      seen.add(dbInst.conversation_id);
      result.push(inst);
    }

    return result;
  }

  async teardownAll(): Promise<void> {
    const conversationIds = Array.from(instances.keys());
    await Promise.all(
      conversationIds.map((id) => this.teardown(id)),
    );
  }
}
