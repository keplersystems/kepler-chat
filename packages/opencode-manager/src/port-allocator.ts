import { env } from "@kepler-chat/env/server";
import { createServer, type Server } from "net";

const usedPorts = new Set<number>();

/**
 * Checks if a port is free on the system by attempting to bind to it.
 */
async function isPortFreeOnSystem(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Allocates a unique port from the configured range.
 * Checks both in-memory tracking and system availability.
 * Throws if no ports available.
 */
export async function allocatePort(): Promise<number> {
  const start = env.KEPLER_PORT_RANGE_START;
  const end = env.KEPLER_PORT_RANGE_END;

  for (let port = start; port <= end; port++) {
    if (usedPorts.has(port)) {
      continue;
    }

    const isFree = await isPortFreeOnSystem(port);
    if (isFree) {
      usedPorts.add(port);
      return port;
    }
  }

  throw new Error("No available ports in configured range");
}

/**
 * Releases a port back to the pool.
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
}

/**
 * Marks a port as allocated without checking availability.
 * Used to reserve ports that are already in use by running instances.
 */
export function reservePort(port: number): void {
  usedPorts.add(port);
}

/**
 * Checks if a port is currently allocated in our tracking.
 */
export function isPortAllocated(port: number): boolean {
  return usedPorts.has(port);
}

/**
 * Checks if a port is free on the system.
 * Useful for health checks and debugging.
 */
export async function isPortFree(port: number): Promise<boolean> {
  return isPortFreeOnSystem(port);
}

/**
 * Clears all allocated ports from tracking.
 * Only use on shutdown or for testing.
 */
export function clearAllocatedPorts(): void {
  usedPorts.clear();
}

/**
 * Returns a copy of currently allocated ports.
 * Useful for debugging.
 */
export function getAllocatedPorts(): number[] {
  return Array.from(usedPorts);
}
