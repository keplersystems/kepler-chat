import {
  createOpencodeServer,
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";
import { db } from "@kepler-chat/db";
import { opencodeInstance } from "@kepler-chat/db/schema/opencode";
import { env } from "@kepler-chat/env/server";
import { createSandboxConfig, SandboxManager } from "@kepler-chat/sandbox";
import { eq } from "drizzle-orm";
import { allocatePort, releasePort, isPortAllocated } from "./port-allocator";
import { resolve, join } from "path";
import { mkdir } from "fs/promises";

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
      if (!isPortAllocated(instance.port)) {
        const isHealthy = await this.healthCheck(instance.user_id);
        if (!isHealthy) {
          await db
            .update(opencodeInstance)
            .set({ status: "stopped" as OpencodeInstanceStatus })
            .where(eq(opencodeInstance.user_id, instance.user_id));
        }
      }
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

    const dbInstance = await db.query.opencodeInstance.findFirst({
      where: eq(opencodeInstance.user_id, userId),
    });

    if (dbInstance?.status === "running") {
      const isHealthy = await this.healthCheck(userId);
      if (isHealthy) {
        const instanceData = {
          client: createOpencodeClient({ baseUrl: dbInstance.server_url }),
          url: dbInstance.server_url,
          port: dbInstance.port,
          pid: dbInstance.pid ?? 0,
          close: async () => {
            await this.teardown(userId);
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
    const userPath = resolve(env.KEPLER_SESSIONS_PATH, userId);

    await mkdir(userPath, { recursive: true });
    await mkdir(join(userPath, "input"), { recursive: true });
    await mkdir(join(userPath, "output"), { recursive: true });
    await mkdir(join(userPath, "playground"), { recursive: true });

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

    const sandboxConfig = createSandboxConfig(userId);
    await SandboxManager.initialize(sandboxConfig);

    let url: string;
    let close: () => void | Promise<void>;

    try {
      const result = await createOpencodeServer({
        hostname: "127.0.0.1",
        port,
      });
      url = result.url;
      close = result.close;
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

    // Extract PID from spawned process (OpenCode SDK doesn't expose it directly)
    const pid = 0; // TODO: OpenCode SDK should expose process.pid

    await db
      .update(opencodeInstance)
      .set({
        status: "running" as OpencodeInstanceStatus,
        pid,
      })
      .where(eq(opencodeInstance.user_id, userId));

    const client = createOpencodeClient({
      baseUrl: url,
      directory: userPath,
    });

    const instanceData: OpencodeInstanceData = {
      client,
      url,
      port,
      pid: pid ?? 0,
      close: async () => {
        await close();
        await SandboxManager.reset();
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
    if (!instance) return;

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
